import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { nostrCloneUri, type GitRepoAnnouncement } from '@/lib/git';

/**
 * Pill-shaped, fully-clickable button that copies the repo's `nostr://` clone
 * URI to the clipboard. The URI text is truncated with an ellipsis and a copy
 * icon sits at the end. Designed to sit inline alongside other card actions.
 */
export function CloneUriPill({
  repo,
  className,
}: {
  repo: GitRepoAnnouncement;
  className?: string;
}) {
  const uri = nostrCloneUri(repo.pubkey, repo.identifier);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(uri);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      } catch {
        // Clipboard unavailable (permissions, insecure context) — fail quietly.
      }
    },
    [uri],
  );

  return (
    <button
      type="button"
      onClick={copy}
      title={uri}
      aria-label={copied ? 'Copied clone URI' : 'Copy nostr clone URI'}
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <code className="min-w-0 truncate font-mono">{uri}</code>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-chart-5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5 shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}

export default CloneUriPill;
