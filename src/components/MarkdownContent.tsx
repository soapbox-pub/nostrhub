import { Children, isValidElement, useMemo, Fragment, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { CopyButton } from '@/components/git/CopyButton';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import { HighlightBlock } from '@/components/markdownHighlight';

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** When true, suppress embedded note/naddr cards — render as inline links only. */
  inlineOnly?: boolean;
}

/** Resolve an href: allow internal/relative anchors and nostr: links, else require https. */
function resolveHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  // In-page anchors and relative doc links (e.g. "01.md", "#section").
  if (href.startsWith('#')) return href;
  // nostr: URIs are routed internally; surface the bech32 entity at the root.
  if (href.startsWith('nostr:')) return `/${href.slice('nostr:'.length)}`;
  return sanitizeUrl(href);
}

/**
 * Tokenize a plain-text string for inline Nostr identifiers and hashtags,
 * returning an array of React nodes safe to render inside any inline context.
 *
 * Handles:
 *   nostr:<prefix><data>  — linked/embedded
 *   bare <prefix><data>   — same
 *   @<prefix><data>       — @ prefix consumed
 *   #word                 — hashtag link
 */
function NostrInlineContent({ text, inlineOnly }: { text: string; inlineOnly?: boolean }) {
  const nodes = useMemo(() => {
    const result: ReactNode[] = [];
    const regex =
      /nostr:(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)|@?(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#[\p{L}\p{N}_]+)/giu;
    let lastIndex = 0;
    let key = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, nostrPfx, nostrData, barePfx, bareData, hashtag] = match;

      if (match.index > lastIndex) {
        result.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
      }

      if (hashtag) {
        const tag = hashtag.slice(1);
        result.push(
          <Link key={key++} to={`/t/${tag}`} className="text-primary hover:underline">
            {hashtag}
          </Link>,
        );
      } else {
        const prefix = nostrPfx || barePfx;
        const data = nostrData || bareData;
        if (prefix && data) {
          const nostrId = `${prefix}${data}`;
          try {
            const decoded = nip19.decode(nostrId);
            if (!inlineOnly && decoded.type === 'nevent') {
              result.push(
                <EmbeddedNote
                  key={key++}
                  eventId={decoded.data.id}
                  relays={decoded.data.relays}
                  authorHint={decoded.data.author}
                  className="my-2.5"
                />,
              );
            } else if (!inlineOnly && decoded.type === 'note') {
              result.push(
                <EmbeddedNote key={key++} eventId={decoded.data as string} className="my-2.5" />,
              );
            } else if (!inlineOnly && decoded.type === 'naddr') {
              result.push(
                <EmbeddedNaddr
                  key={key++}
                  addr={{
                    kind: decoded.data.kind,
                    pubkey: decoded.data.pubkey,
                    identifier: decoded.data.identifier,
                  }}
                  className="my-2.5"
                />,
              );
            } else if (decoded.type === 'npub' || decoded.type === 'nprofile') {
              const pubkey = decoded.type === 'npub' ? decoded.data : decoded.data.pubkey;
              result.push(<NostrMentionInline key={key++} pubkey={pubkey} raw={fullMatch} />);
            } else {
              result.push(
                <Link key={key++} to={`/${nostrId}`} className="text-primary hover:underline break-all">
                  {fullMatch}
                </Link>,
              );
            }
          } catch {
            result.push(<Fragment key={key++}>{fullMatch}</Fragment>);
          }
        }
      }

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < text.length) {
      result.push(<Fragment key={key}>{text.slice(lastIndex)}</Fragment>);
    }

    return result.length > 0 ? result : [text];
  }, [text, inlineOnly]);

  return <>{nodes}</>;
}

function NostrMentionInline({ pubkey, raw }: { pubkey: string; raw: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name ?? author.data?.metadata?.display_name;
  const npub = nip19.npubEncode(pubkey);
  return (
    <Link to={`/${npub}`} className="font-medium text-primary hover:underline">
      @{name ?? raw}
    </Link>
  );
}

/**
 * Recursively walk React children and replace every plain-string leaf with
 * a `<NostrInlineContent>` node so that Nostr URIs embedded in Markdown
 * paragraphs are tokenized and rendered, not shown as raw text.
 *
 * Skips code blocks (we never want to linkify inside `<code>`).
 */
function enrichChildren(children: ReactNode, inlineOnly?: boolean): ReactNode {
  if (typeof children === 'string') {
    // Only bother if there's a Nostr identifier or hashtag present.
    if (!/nostr:|npub1|note1|nprofile1|nevent1|naddr1|#[\p{L}\p{N}_]/iu.test(children)) {
      return children;
    }
    return <NostrInlineContent text={children} inlineOnly={inlineOnly} />;
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <Fragment key={i}>{enrichChildren(child, inlineOnly)}</Fragment>
    ));
  }
  return children;
}

/** Recursively collect the plain-text content of a React node tree. */
function extractText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement(node)) {
    return extractText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/** Media extensions rendered inline when a bare URL is autolinked. */
const IMAGE_URL_RE = /\.(png|jpe?g|gif|webp|avif)(\?[^\s]*)?$/i;
const VIDEO_URL_RE = /\.(mp4|webm|mov|m4v)(\?[^\s]*)?$/i;

function buildComponents(inlineOnly?: boolean): Components {
  // Enrich Nostr tokens, then overlay community highlights across the whole block.
  const block = (children: ReactNode, inline?: boolean) => (
    <HighlightBlock>{enrichChildren(children, inline)}</HighlightBlock>
  );
  return {
    h1: ({ children }) => <h1 className="mt-8 mb-4 scroll-mt-24 text-2xl font-bold tracking-tight first:mt-0">{block(children, true)}</h1>,
    h2: ({ children }) => <h2 className="mt-8 mb-3 scroll-mt-24 border-b border-border/60 pb-1 text-xl font-semibold first:mt-0">{block(children, true)}</h2>,
    h3: ({ children }) => <h3 className="mt-6 mb-2 scroll-mt-24 text-lg font-semibold">{block(children, true)}</h3>,
    h4: ({ children }) => <h4 className="mt-4 mb-2 scroll-mt-24 font-semibold">{block(children, true)}</h4>,
    p: ({ children }) => <p className="my-4 leading-7">{block(children, inlineOnly)}</p>,
    a: ({ href, children }) => {
      const safe = resolveHref(href);
      const external = safe?.startsWith('http');
      if (!safe) return <span>{children}</span>;
      // A bare media URL (autolinked by remark-gfm, so the link text is the
      // URL itself) renders as inline media, GitHub/Gitworkshop-style.
      if (external && !inlineOnly) {
        const text = extractText(children).trim();
        if (text === href?.trim() || text === safe) {
          if (IMAGE_URL_RE.test(safe)) {
            return (
              <img
                src={safe}
                alt=""
                className="my-4 max-w-full rounded-lg border border-border/60"
                loading="lazy"
              />
            );
          }
          if (VIDEO_URL_RE.test(safe)) {
            return (
              <video
                src={safe}
                controls
                preload="metadata"
                className="my-4 max-h-[480px] max-w-full rounded-lg border border-border/60"
              />
            );
          }
        }
      }
      return (
        <a
          href={safe}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {children}
        </a>
      );
    },
    ul: ({ children }) => <ul className="my-4 ml-6 list-disc space-y-1.5">{children}</ul>,
    ol: ({ children }) => <ol className="my-4 ml-6 list-decimal space-y-1.5">{children}</ol>,
    li: ({ children }) => <li className="leading-7">{block(children, inlineOnly)}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-4 border-primary/40 pl-4 italic text-muted-foreground">{block(children, true)}</blockquote>
    ),
    code: ({ className, children }) => {
      const isBlock = /language-/.test(className ?? '');
      if (isBlock) {
        return <code className={cn('font-mono text-sm', className)}>{children}</code>;
      }
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>
      );
    },
    pre: ({ children }) => {
      const code = extractText(Children.toArray(children)).replace(/\n$/, '');
      return (
        <div className="group relative my-4">
          <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/60 p-4 text-sm leading-relaxed">
            {children}
          </pre>
          <CopyButton
            value={code}
            label="Copy code"
            className="absolute right-2 top-2 bg-background/70 opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          />
        </div>
      );
    },
    img: ({ src, alt }) => {
      const safe = sanitizeUrl(typeof src === 'string' ? src : undefined);
      if (!safe) return null;
      return <img src={safe} alt={alt ?? ''} className="my-4 max-w-full rounded-lg border border-border/60" loading="lazy" />;
    },
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-border px-3 py-2 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border border-border px-3 py-2 align-top">{block(children, inlineOnly)}</td>,
    hr: () => <hr className="my-8 border-border/60" />,
  };
}

/** Render NIP / community / article Markdown safely (no raw HTML, sanitized URLs).
 *  Nostr URIs (nostr:nevent1…, nostr:naddr1…, nostr:npub1…, etc.) that appear as
 *  plain text inside paragraphs are tokenized and rendered as embedded cards or links.
 */
export function MarkdownContent({ content, className, inlineOnly }: MarkdownContentProps) {
  const components = useMemo(() => buildComponents(inlineOnly), [inlineOnly]);

  const rendered = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        skipHtml
        components={components}
      >
        {content}
      </ReactMarkdown>
    ),
    [content, components],
  );

  return <div className={cn('break-words text-[0.95rem] text-foreground', className)}>{rendered}</div>;
}

export default MarkdownContent;
