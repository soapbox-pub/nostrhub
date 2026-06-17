/**
 * A custom HTTP client for isomorphic-git.
 *
 * The stock `isomorphic-git/http/web` client streams the request body, which
 * Firefox and some git smart-HTTP servers mishandle — the response comes back
 * empty and isomorphic-git fails with `Expected "unpack ok" … received ""`
 * during `git-receive-pack`. Buffering the request body into a `Blob` before
 * sending (as Shakespeare does) fixes this.
 *
 * It also optionally routes requests through a CORS proxy, since most git
 * forges (GitHub, GitLab, …) don't send `Access-Control-Allow-Origin` headers.
 * The proxy template uses the `{href}` convention; an empty template sends the
 * request directly (fine for CORS-enabled GRASP hosts).
 */

import type { GitHttpRequest, GitHttpResponse, HttpClient } from 'isomorphic-git';

/** Apply a `{href}` proxy template to a target URL. */
export function applyCorsProxy(template: string, url: string): string {
  if (!template) return url;
  if (template.includes('{href}')) {
    return template.replace('{href}', encodeURIComponent(url));
  }
  return `${template}${url}`;
}

/** Drain an async iterable of byte chunks into a single Uint8Array. */
async function collectBody(
  src: AsyncIterableIterator<Uint8Array> | Uint8Array[] | undefined,
): Promise<Uint8Array | undefined> {
  if (!src) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of src as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Portable async iterator over a ReadableStream. */
function streamToAsyncIterator(
  stream: ReadableStream<Uint8Array>,
): AsyncIterableIterator<Uint8Array> {
  const reader = stream.getReader();
  return {
    async next() {
      const { value, done } = await reader.read();
      return done ? { value: undefined, done: true } : { value, done: false };
    },
    async return() {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return { value: undefined, done: true };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/**
 * Build an isomorphic-git {@link HttpClient} that buffers request bodies and,
 * when `proxyTemplate` is non-empty, routes requests through a CORS proxy.
 */
export function makeGitHttp(proxyTemplate = ''): HttpClient {
  return {
    async request(req: GitHttpRequest): Promise<GitHttpResponse> {
      const method = req.method ?? 'GET';
      const target = applyCorsProxy(proxyTemplate, req.url);

      // isomorphic-git sets `Accept: application/x-git-*-result` on the POST.
      // That value isn't CORS-safelisted, so it forces a preflight — and GRASP
      // servers only allow `Content-Type` in `Access-Control-Allow-Headers`,
      // which makes the preflight fail and the response come back empty. Drop
      // `Accept` (the server returns the right content-type regardless) unless
      // we're going through a proxy, which echoes permissive CORS headers.
      const headers: Record<string, string> = { ...(req.headers ?? {}) };
      if (!proxyTemplate) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'accept') delete headers[key];
        }
      }

      const init: RequestInit = { method, headers };
      const body = await collectBody(req.body as AsyncIterableIterator<Uint8Array> | undefined);
      if (body) init.body = new Blob([new Uint8Array(body)]);

      const response = await fetch(target, init);
      const resHeaders = Object.fromEntries(response.headers.entries());

      return {
        url: response.url,
        method,
        statusCode: response.status,
        statusMessage: response.statusText,
        body: response.body ? streamToAsyncIterator(response.body) : undefined,
        headers: resHeaders,
      };
    },
  };
}
