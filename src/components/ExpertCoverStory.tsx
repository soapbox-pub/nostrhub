import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Trim the bio to a magazine-dek length without cutting mid-word. */
function dek(about: string, max = 280): string {
  if (about.length <= max) return about;
  const cut = about.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * The magazine cover feature: the first configured expert, blown up to
 * front-page scale with a kicker, headline-sized name, and a dek pulled from
 * their profile bio.
 */
export function ExpertCoverStory({ pubkey }: { pubkey: string }) {
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

  return (
    <section
      aria-labelledby="cover-story-heading"
      className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card/60 backdrop-blur-sm"
    >
      {/* Cover glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-0 size-[26rem] rounded-full bg-primary/20 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-nebula/20 blur-[110px]"
      />

      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-sm bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-primary-foreground">
              Cover Story
            </span>
          </div>

          <h2
            id="cover-story-heading"
            className="font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl"
          >
            <span className="text-cosmic break-words">{displayName}</span>
          </h2>

          {author.isLoading && !metadata ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="h-4 w-3/4 max-w-lg" />
            </div>
          ) : (
            <>
              {handle && (
                <p className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
                  <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                  {handle}
                </p>
              )}
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-6xl first-letter:font-bold first-letter:leading-[0.8] first-letter:text-primary">
                {about
                  ? dek(about)
                  : 'They ship in silence and let the protocol speak. Our cover star needs no bio — the commits tell the story.'}
              </p>
            </>
          )}

          <div className="clear-left">
            <Button asChild className="gap-1.5 rounded-full shadow-lg shadow-primary/25">
              <Link to={`/${npub}`}>
                Read the cover story
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Cover portrait */}
        <Link
          to={`/${npub}`}
          aria-label={`View ${displayName}'s profile`}
          className="group relative mx-auto block shrink-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 scale-110 rounded-full bg-gradient-to-tr from-primary/30 to-nebula/30 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
          />
          <UserAvatar
            pubkey={pubkey}
            size="lg"
            className="relative size-44 transition-transform duration-500 group-hover:scale-[1.03] sm:size-56 [&_[data-slot=avatar-fallback]]:text-5xl"
          />
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rotate-[-4deg] whitespace-nowrap rounded-sm border-2 border-primary bg-background/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-primary shadow-sm backdrop-blur-sm">
            Verified Expert
          </span>
        </Link>
      </div>
    </section>
  );
}

export default ExpertCoverStory;
