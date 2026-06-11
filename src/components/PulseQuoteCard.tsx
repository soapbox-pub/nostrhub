import { Link } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import type { ExpertNote } from '@/hooks/useExpertPress';
import { UserAvatar } from '@/components/UserAvatar';
import { noteExcerpt, shortAgo } from '@/lib/noteText';
import { shortNpub } from '@/lib/nostr';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A magazine pull-quote card for an expert's note: oversized quotation mark,
 * display-type excerpt, and an avatar byline.
 */
export function PulseQuoteCard({ note }: { note: ExpertNote }) {
  const author = useAuthor(note.event.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || shortNpub(note.event.pubkey);
  const excerpt = noteExcerpt(note.event.content, 240);

  if (!excerpt) return null;

  return (
    <Card className="group relative h-full overflow-hidden border-border/70 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-nebula/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-nebula/30">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 left-3 select-none font-display text-8xl font-bold leading-none text-nebula/25 transition-colors duration-300 group-hover:text-nebula/40"
      >
        “
      </span>
      <Link
        to={`/${note.nevent}`}
        className="relative block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="flex h-full flex-col gap-4 px-5 pt-10">
          <p className="line-clamp-5 flex-1 font-display text-lg font-medium leading-snug tracking-tight">
            {excerpt}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserAvatar pubkey={note.event.pubkey} size="sm" />
            <span className="truncate font-semibold uppercase tracking-wide text-foreground">
              {name}
            </span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{shortAgo(note.event.created_at)}</span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export default PulseQuoteCard;
