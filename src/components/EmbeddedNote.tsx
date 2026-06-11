import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { NoteContent } from '@/components/NoteContent';
import { Skeleton } from '@/components/ui/skeleton';
import { shortNpub } from '@/lib/nostr';
import { cn } from '@/lib/utils';
import { SEARCH_RELAYS } from '@/lib/searchRelays';

interface EmbeddedNoteProps {
  eventId: string;
  relays?: string[];
  authorHint?: string;
  className?: string;
}

function useEvent(eventId: string, relays?: string[], authorHint?: string) {
  const { nostr } = useNostr();
  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'event', eventId],
    queryFn: async ({ signal }) => {
      const filter = {
        ids: [eventId],
        ...(authorHint ? { authors: [authorHint] } : {}),
        limit: 1,
      };
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) };

      // Try relays from the nevent hint first, then pool, then search relays
      const sources: Array<() => Promise<NostrEvent[]>> = [];
      if (relays?.length) {
        sources.push(() => nostr.group(relays).query([filter], opts));
      }
      sources.push(() => nostr.query([filter], opts));
      sources.push(() => nostr.group(SEARCH_RELAYS).query([filter], opts));

      for (const fetch of sources) {
        const events = await fetch().catch(() => []);
        if (events.length > 0) return events[0];
      }
      return null;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Fully rendered embedded (quoted) note card with author, timestamp, and content. */
export function EmbeddedNote({ eventId, relays, authorHint, className }: EmbeddedNoteProps) {
  const { data: event, isLoading } = useEvent(eventId, relays, authorHint);

  const neventId = nip19.neventEncode({
    id: eventId,
    ...(authorHint ? { author: authorHint } : {}),
    ...(relays?.length ? { relays } : {}),
  });

  if (isLoading) {
    return (
      <div className={cn('border rounded-lg p-3 space-y-2', className)}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    );
  }

  if (!event) {
    return (
      <Link
        to={`/${neventId}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'block border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-sm text-muted-foreground',
          className,
        )}
      >
        <span className="font-mono text-xs">{neventId.slice(0, 24)}…</span>
      </Link>
    );
  }

  return <EmbeddedNoteCard event={event} neventId={neventId} className={className} />;
}

function EmbeddedNoteCard({
  event,
  neventId,
  className,
}: {
  event: NostrEvent;
  neventId: string;
  className?: string;
}) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || shortNpub(event.pubkey);
  const npub = nip19.npubEncode(event.pubkey);
  const date = new Date(event.created_at * 1000);
  const timeStr = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Link
      to={`/${neventId}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block border rounded-lg p-3 hover:bg-muted/40 transition-colors',
        className,
      )}
    >
      {/* Author row */}
      <div className="flex items-center gap-2 mb-2">
        <UserAvatar pubkey={event.pubkey} size="sm" />
        <span
          className="truncate text-sm font-semibold hover:text-primary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = `/${npub}`;
          }}
        >
          {displayName}
        </span>
        <time
          dateTime={date.toISOString()}
          className="ml-auto shrink-0 text-xs text-muted-foreground"
        >
          {timeStr}
        </time>
      </div>

      {/* Content — disable recursive note embeds and heavy media to keep card compact */}
      <div className="text-sm leading-relaxed">
        <NoteContent
          event={event}
          disableNoteEmbeds
          disableMediaEmbeds
        />
      </div>
    </Link>
  );
}
