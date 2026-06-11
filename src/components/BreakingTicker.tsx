import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import type { ExpertNote } from '@/hooks/useExpertPress';
import { noteExcerpt } from '@/lib/noteText';
import { shortNpub } from '@/lib/nostr';

function TickerItem({ note }: { note: ExpertNote }) {
  const author = useAuthor(note.event.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || shortNpub(note.event.pubkey);
  const excerpt = noteExcerpt(note.event.content, 110);

  if (!excerpt) return null;

  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <Zap className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <Link
        to={`/${note.nevent}`}
        className="whitespace-nowrap text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <span className="font-bold uppercase tracking-wide">{name}:</span>{' '}
        <span className="text-muted-foreground">{excerpt}</span>
      </Link>
    </span>
  );
}

/**
 * A scrolling "live wire" news ticker of the experts' latest posts. The track
 * renders two copies of the items and slides by -50% for a seamless loop;
 * hovering pauses it, and reduced-motion users get a static strip.
 */
export function BreakingTicker({ notes }: { notes: ExpertNote[] }) {
  if (notes.length === 0) return null;

  return (
    <div
      aria-label="Live wire: latest posts from the expert panel"
      className="group relative flex items-stretch overflow-hidden border-y-2 border-primary/40 bg-primary/5"
    >
      <span className="relative z-10 flex shrink-0 items-center gap-1.5 bg-primary px-3 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-primary-foreground">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground/80 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-primary-foreground" />
        </span>
        Live Wire
      </span>

      <div className="relative flex min-w-0 flex-1 items-center overflow-hidden">
        <div className="flex w-max items-center gap-10 px-5 py-2 motion-safe:animate-[marquee_60s_linear_infinite] group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              aria-hidden={copy === 1 || undefined}
              className="flex shrink-0 items-center gap-10"
            >
              {notes.map((note) => (
                <TickerItem key={`${copy}-${note.event.id}`} note={note} />
              ))}
            </div>
          ))}
        </div>
        {/* Edge fades */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
        />
      </div>
    </div>
  );
}

export default BreakingTicker;
