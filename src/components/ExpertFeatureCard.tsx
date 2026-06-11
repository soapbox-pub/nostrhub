import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Rotating editorial kickers so the feature well reads like a real issue. */
const KICKERS = [
  'Exclusive',
  'Interview',
  'Deep Dive',
  'Spotlight',
  'Insider',
  'Field Report',
  'Tech Briefing',
  'The Long Read',
];

interface ExpertFeatureCardProps {
  pubkey: string;
  /** Position in the feature well — drives the page number and kicker. */
  index: number;
}

/**
 * A magazine feature card for one expert: kicker, ghost page number,
 * byline-style identity, and their bio as the dek.
 */
export function ExpertFeatureCard({ pubkey, index }: ExpertFeatureCardProps) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;

  const npub = (() => {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return pubkey;
    }
  })();

  const displayName = metadata?.display_name || metadata?.name || shortNpub(pubkey);
  const handle = metadata?.nip05;
  const about = metadata?.about;
  const kicker = KICKERS[index % KICKERS.length];
  const pageNumber = String(index + 2).padStart(2, '0');

  return (
    <Card className="group relative h-full overflow-hidden border-border/70 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
      {/* Ghost page number, like a giant folio in the corner */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-3 right-2 select-none font-display text-7xl font-bold leading-none text-transparent opacity-60 transition-opacity duration-300 [-webkit-text-stroke:1.5px_var(--border)] group-hover:opacity-100 group-hover:[-webkit-text-stroke:1.5px_var(--primary)]"
      >
        {pageNumber}
      </span>
      {/* Nebula sheen that fades in on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary/20 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />

      <Link
        to={`/${npub}`}
        className="relative block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="flex h-full flex-col gap-3 px-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
            {kicker}
          </span>

          <div className="flex items-center gap-3">
            <UserAvatar pubkey={pubkey} size="lg" className="size-12 shrink-0" />
            <div className="min-w-0">
              <h3 className="truncate font-display text-xl font-bold leading-tight tracking-tight group-hover:text-primary">
                {displayName}
              </h3>
              {author.isLoading && !metadata ? (
                <Skeleton className="mt-1 h-3 w-24" />
              ) : (
                handle && <p className="truncate font-mono text-xs text-muted-foreground">{handle}</p>
              )}
            </div>
          </div>

          <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
            {about ?? 'Bio withheld. The work speaks for itself.'}
          </p>

          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-primary">
            Full story
            <ArrowRight
              className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </CardContent>
      </Link>
    </Card>
  );
}

export default ExpertFeatureCard;
