import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Layout } from '@/components/Layout';
import { NoteContent } from '@/components/NoteContent';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import { SEARCH_RELAYS } from '@/lib/searchRelays';
import { useAppContext } from '@/hooks/useAppContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** A single note (kind 1) page, addressed by note1/nevent1 id. */
export function NotePage({ id }: { id: string }) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const searchRelays = config.searchRelays.length > 0 ? config.searchRelays : SEARCH_RELAYS;

  const { data: event, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['note', id],
    queryFn: async ({ signal }) => {
      const filter = { ids: [id], limit: 1 };
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) };

      // The app pool first; fall back to the search relays, since notes
      // discovered via NIP-50 may only live there.
      const fromPool = await nostr.query([filter], opts);
      const events = fromPool.length > 0 ? fromPool : await nostr.group(searchRelays).query([filter], opts);

      return events[0] ?? null;
    },
    staleTime: 60 * 1000,
  });

  const author = useAuthor(event?.pubkey ?? '');
  const metadata = author.data?.metadata;
  const name = event
    ? metadata?.display_name || metadata?.name || shortNpub(event.pubkey)
    : undefined;

  useSeoMeta({
    title: name ? `Post by ${name} — NostrHub` : 'Post — NostrHub',
    description: event?.content.slice(0, 160) ?? 'A post on Nostr.',
  });

  if (isLoading) {
    return (
      <Layout className="max-w-2xl">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout className="max-w-2xl">
        <Card className="border-dashed">
          <CardContent className="px-8 py-12 text-center">
            <p className="mx-auto max-w-sm text-muted-foreground">
              Post not found. It may not have propagated to your relays yet.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const npub = nip19.npubEncode(event.pubkey);
  const date = new Date(event.created_at * 1000);

  return (
    <Layout className="max-w-2xl">
      <Card className="bg-card/70 backdrop-blur-sm">
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <Link to={`/${npub}`} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <UserAvatar pubkey={event.pubkey} size="lg" />
          </Link>
          <div className="min-w-0">
            <Link to={`/${npub}`} className="block truncate font-semibold hover:text-primary">
              {name}
            </Link>
            <time dateTime={date.toISOString()} className="text-xs text-muted-foreground">
              {date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </time>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-lg leading-relaxed">
            <NoteContent event={event} />
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}

export default NotePage;
