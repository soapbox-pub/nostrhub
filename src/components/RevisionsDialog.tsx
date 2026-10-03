import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import { AlertCircle, GitCompare, History } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNipRevisions, type NipRevisionsArgs } from '@/hooks/useNipRevisions';
import { revisionRef } from '@/hooks/useResolvedNip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface RevisionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The addressable event coordinate whose history to load. */
  target: NipRevisionsArgs;
  /** Relays to embed in the generated nevent for the chosen revision. */
  relays?: string[];
}

/** Take the first non-empty line of content as a tiny preview. */
function previewLine(content: string): string {
  const line = content
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0);
  return line ?? '';
}

/**
 * Lists every stored version of an addressable NIP (fetched from the Ditto
 * relay) and lets the user open a specific past version by its `nevent`, which
 * pins the exact event id rather than resolving the latest via `naddr`.
 */
export function RevisionsDialog({ open, onOpenChange, target, relays }: RevisionsDialogProps) {
  const navigate = useNavigate();
  const { data: revisions, isLoading, isError } = useNipRevisions(target, open);

  const handleOpenRevision = (event: NostrEvent) => {
    const nevent = nip19.neventEncode({
      id: event.id,
      author: event.pubkey,
      kind: event.kind,
      relays,
    });
    onOpenChange(false);
    navigate(`/${nevent}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5" aria-hidden="true" /> Revisions
          </DialogTitle>
          <DialogDescription>
            Past versions of this NIP. Select one to view that exact revision, or compare it with
            the version before it.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>Could not load revisions from the relay.</AlertDescription>
          </Alert>
        ) : !revisions || revisions.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">No revision history available.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] -mx-2 px-2">
            <ul className="space-y-2">
              {revisions.map((event, index) => {
                const date = new Date(event.created_at * 1000);
                const isLatest = index === 0;
                const preview = previewLine(event.content);
                const previous = revisions[index + 1];
                return (
                  <li key={event.id} className="relative">
                    <button
                      type="button"
                      onClick={() => handleOpenRevision(event)}
                      className={cn(
                        'w-full rounded-lg border border-border/60 bg-card p-3 text-left transition-colors',
                        'hover:border-primary/60 hover:bg-accent focus-visible:outline-none',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {date.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                          {' · '}
                          <span className="text-muted-foreground">
                            {formatDistanceToNow(date, { addSuffix: true })}
                          </span>
                        </span>
                        {isLatest && (
                          <Badge variant="secondary" className="shrink-0">
                            Latest
                          </Badge>
                        )}
                      </div>
                      {preview && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
                      )}
                      {/* Reserve room for the compare link overlaid below. */}
                      {previous && <span className="mt-1 block h-5" aria-hidden="true" />}
                    </button>
                    {previous && (
                      <Link
                        to={`/compare?a=${revisionRef(previous)}&b=${revisionRef(event)}`}
                        onClick={() => onOpenChange(false)}
                        className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <GitCompare className="size-3.5" aria-hidden="true" />
                        Compare with previous
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
