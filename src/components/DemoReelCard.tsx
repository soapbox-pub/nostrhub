import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { noteExcerpt, shortAgo } from '@/lib/noteText';
import { shortNpub } from '@/lib/nostr';
import { Card } from '@/components/ui/card';

/**
 * A "demo reel" card for a NIP-50 search hit: excerpt and byline, like a
 * game-mag preview blurb. Text only — no screenshots.
 */
export function DemoReelCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || shortNpub(event.pubkey);
  const excerpt = noteExcerpt(event.content, 200);
  const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey });

  if (!excerpt) return null;

  return (
    <Card className="group relative h-full overflow-hidden border-border/70 bg-card/60 py-0 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
      <Link
        to={`/${nevent}`}
        className="flex h-full flex-col rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-1 flex-col gap-3 p-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
            Field Report
          </span>
          <p className="line-clamp-3 flex-1 text-sm leading-relaxed">{excerpt}</p>
          <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <UserAvatar pubkey={event.pubkey} size="sm" />
            <span className="truncate font-semibold uppercase tracking-wide text-foreground">
              {name}
            </span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{shortAgo(event.created_at)}</span>
          </div>
        </div>
      </Link>
    </Card>
  );
}

export default DemoReelCard;
