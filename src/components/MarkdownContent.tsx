import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
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

const components: Components = {
  h1: ({ children }) => <h1 className="mt-8 mb-4 scroll-mt-24 text-2xl font-bold tracking-tight first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-8 mb-3 scroll-mt-24 border-b border-border/60 pb-1 text-xl font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 mb-2 scroll-mt-24 text-lg font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-2 scroll-mt-24 font-semibold">{children}</h4>,
  p: ({ children }) => <p className="my-4 leading-7">{children}</p>,
  a: ({ href, children }) => {
    const safe = resolveHref(href);
    const external = safe?.startsWith('http');
    if (!safe) return <span>{children}</span>;
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
  li: ({ children }) => <li className="leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-primary/40 pl-4 italic text-muted-foreground">{children}</blockquote>
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
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg border border-border/60 bg-muted/60 p-4 text-sm leading-relaxed">
      {children}
    </pre>
  ),
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
  td: ({ children }) => <td className="border border-border px-3 py-2 align-top">{children}</td>,
  hr: () => <hr className="my-8 border-border/60" />,
};

/** Render NIP / community Markdown safely (no raw HTML, sanitized URLs). */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const rendered = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {content}
      </ReactMarkdown>
    ),
    [content],
  );

  return <div className={cn('text-[0.95rem] text-foreground', className)}>{rendered}</div>;
}

export default MarkdownContent;
