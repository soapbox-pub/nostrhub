import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Plus, Zap } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipCard } from '@/components/NipCard';
import { BreakingTicker } from '@/components/BreakingTicker';
import { ExpertCoverStory } from '@/components/ExpertCoverStory';
import { ExpertPanelStrip } from '@/components/ExpertPanelStrip';
import { LeadArticleCard, ArticleCard } from '@/components/ArticleCards';
import { PulseQuoteCard } from '@/components/PulseQuoteCard';
import { DemoReelCard } from '@/components/DemoReelCard';
import { useExpertPress } from '@/hooks/useExpertPress';
import { useNostrSearch } from '@/hooks/useNostrSearch';
import { useRankedNips, type RankedNip } from '@/hooks/useRankedNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useExperts } from '@/hooks/useExperts';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { nipTargetKey } from '@/hooks/useNipApprovals';
import type { CustomNip } from '@/lib/nips';
import { noteExcerpt } from '@/lib/noteText';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

/** Adapt a community draft into the shape `NipCard` renders. */
function draftToRanked(nip: CustomNip): RankedNip {
  const target = { type: 'custom', address: nip.address } as const;
  return {
    key: nipTargetKey(target),
    target,
    title: nip.title,
    custom: nip,
    kinds: nip.kinds,
    expertCount: 0,
    totalCount: 0,
    expertApprovers: [],
  };
}

/** Editorial department header: slab title with a highlighter swipe and a short dek. */
function Department({
  title,
  subtitle,
  accent = 'primary',
  action,
}: {
  title: string;
  subtitle?: string;
  accent?: 'primary' | 'nebula';
  action?: React.ReactNode;
}) {
  const accentSwipe = accent === 'primary' ? 'bg-primary/30' : 'bg-nebula/30';

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="relative inline-block font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
          <span
            aria-hidden="true"
            className={`absolute -inset-x-2 bottom-0 h-3.5 -skew-x-12 ${accentSwipe}`}
          />
          <span className="relative">{title}</span>
        </h2>
        {action}
      </div>
      {subtitle && <p className="max-w-2xl text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function CardSkeleton({ withImage = false }: { withImage?: boolean }) {
  return (
    <Card className={withImage ? 'overflow-hidden py-0' : undefined}>
      {withImage && <Skeleton className="aspect-[16/9] w-full rounded-none" />}
      <CardContent className={withImage ? 'space-y-2 p-5' : 'space-y-2 p-4'}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </CardContent>
    </Card>
  );
}

const Index = () => {
  useSeoMeta({
    title: 'NostrHub — Build Nostr Together',
    description:
      'NostrHub is where the developer community collaborates on building the Nostr protocol — discover, draft, and discuss NIPs together.',
  });

  const { experts } = useExperts();
  const { user } = useCurrentUser();
  const { ranked, isLoading: rankedLoading } = useRankedNips();
  const community = useCommunityAuthors();
  const press = useExpertPress();
  const draftsQuery = useCustomNips({
    authors: community.data?.authors,
    limit: 30,
    enabled: !community.isLoading,
  });

  // NIP-50: scour the search relays for fresh demos, launches, and ships.
  const demoSearch = useNostrSearch({
    searches: ['nostr demo', 'just shipped', 'built on nostr'],
    kinds: [1],
    sinceDays: 30,
    limit: 20,
  });

  const hasExperts = experts.length > 0;
  const [coverStar, ...panel] = experts;

  const articles = press.data?.articles ?? [];
  const [leadArticle, ...moreArticles] = articles;
  const tickerNotes = useMemo(() => (press.data?.notes ?? []).slice(0, 8), [press.data]);
  const pullQuotes = useMemo(
    () =>
      (press.data?.notes ?? [])
        .filter((note) => noteExcerpt(note.event.content).length >= 60)
        .slice(0, 3),
    [press.data],
  );
  const demos = useMemo(
    () =>
      (demoSearch.data ?? [])
        .filter((ev) => !ev.tags.some(([n]) => n === 'e') && noteExcerpt(ev.content).length >= 30)
        .slice(0, 6),
    [demoSearch.data],
  );
  const topNips = ranked.slice(0, 7);
  const drafts = (draftsQuery.data ?? []).slice(0, 6);

  // Issue numbering counted from Nostr's genesis (fiatjaf's first relay,
  // November 2020), so every month really is a new issue.
  const now = new Date();
  const issueNo = (now.getFullYear() - 2020) * 12 + now.getMonth() - 10 + 1;
  const issueDate = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Layout className="max-w-6xl">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="mb-6 space-y-4">
        <div className="flex items-center justify-between gap-3 border-y-2 border-foreground/80 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] sm:text-xs">
          <span>Issue No. {issueNo}</span>
          <span className="hidden sm:inline text-muted-foreground">{issueDate}</span>
          <span className="rounded-sm bg-primary px-2 py-0.5 text-primary-foreground">
            The Future Issue
          </span>
        </div>

        <h1 className="text-center font-display text-6xl font-bold uppercase leading-[0.9] tracking-tighter sm:text-8xl">
          Nostr<span className="text-cosmic">Hub</span>
        </h1>
        <p className="text-center text-lg text-muted-foreground">
          The people building the next internet.
        </p>
      </header>

      {/* ── Live wire ticker ─────────────────────────────────────── */}
      {tickerNotes.length > 0 && (
        <div className="mb-10">
          <BreakingTicker notes={tickerNotes} />
        </div>
      )}

      <div className="space-y-14">
        {/* ── Subscription insert (no experts configured) ──────────── */}
        {!hasExperts && (
          <Card className="rotate-[-0.5deg] border-2 border-dashed border-primary/50 bg-primary/5">
            <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="space-y-1">
                <p className="font-display text-2xl font-bold uppercase tracking-tight">
                  Your editorial board is empty
                </p>
                <p className="text-muted-foreground">
                  Recruit a panel of Nostr experts to curate the ranking and start the presses.
                </p>
              </div>
              <Button asChild className="shrink-0 rounded-full">
                <Link to="/settings">Configure experts</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── The experts, front and center ────────────────────────── */}
        {coverStar && (
          <section className="space-y-4" aria-label="The expert panel">
            <ExpertCoverStory pubkey={coverStar} />
            <ExpertPanelStrip pubkeys={panel} />
          </section>
        )}

        {/* ── The features (expert long-form articles) ─────────────── */}
        {hasExperts && (press.isLoading || articles.length > 0) && (
          <section className="space-y-5" aria-label="Feature articles from the experts">
            <Department title="The Features" subtitle="Long-form dispatches from the panel." />
            {press.isLoading ? (
              <CardSkeleton withImage />
            ) : (
              <div className="space-y-4">
                {leadArticle && <LeadArticleCard article={leadArticle} />}
                {moreArticles.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {moreArticles.slice(0, 3).map((article) => (
                      <ArticleCard key={article.naddr} article={article} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Overheard on the wire (pull quotes) ──────────────────── */}
        {hasExperts && (press.isLoading || pullQuotes.length > 0) && (
          <section className="space-y-5" aria-label="Recent posts from the experts">
            <Department
              title="Overheard on the Wire"
              subtitle="Hot takes from the panel's feeds."
              accent="nebula"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {press.isLoading ? (
                <>
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                </>
              ) : (
                pullQuotes.map((note) => <PulseQuoteCard key={note.event.id} note={note} />)
              )}
            </div>
          </section>
        )}

        {/* ── The review section (expert-approved NIPs) ────────────── */}
        <section className="space-y-5" aria-label="Expert-approved NIPs">
          <Department
            title="The Review Section"
            subtitle="NIPs that earned the panel's seal."
            action={
              user && (
                <Button asChild size="sm" className="gap-1.5 rounded-full shadow-lg shadow-primary/25">
                  <Link to="/create">
                    <Plus className="size-4" />
                    New NIP
                  </Link>
                </Button>
              )
            }
          />
          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
            {rankedLoading ? (
              <>
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : topNips.length > 0 ? (
              topNips.map((nip, i) =>
                i === 0 ? (
                  <div key={nip.key} className="relative sm:col-span-2">
                    <span className="absolute -top-3 left-4 z-10 rotate-[-3deg] rounded-sm border-2 border-primary bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-primary shadow-sm">
                      Editors' Choice
                    </span>
                    <NipCard nip={nip} />
                  </div>
                ) : (
                  <NipCard key={nip.key} nip={nip} />
                ),
              )
            ) : (
              <Card className="border-dashed sm:col-span-2 lg:col-span-3">
                <CardContent className="px-8 py-12 text-center">
                  <p className="mx-auto max-w-sm text-muted-foreground">
                    No expert-approved NIPs yet. When your experts approve NIPs, they'll appear
                    here ranked by approval count.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* ── The demo reel (NIP-50 search) ────────────────────────── */}
        {(demoSearch.isLoading || demos.length > 0) && (
          <section className="space-y-5" aria-label="Fresh demos and launches from across the network">
            <Department
              title="Shipping Now"
              subtitle="Demos and launches, live from the search relays."
              accent="nebula"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {demoSearch.isLoading ? (
                <>
                  <CardSkeleton withImage />
                  <CardSkeleton withImage />
                  <CardSkeleton withImage />
                </>
              ) : (
                demos.map((event) => <DemoReelCard key={event.id} event={event} />)
              )}
            </div>
          </section>
        )}

        {/* ── Rumor mill (fresh community drafts) ──────────────────── */}
        <section className="space-y-5" aria-label="Latest community drafts">
          <Department title="The Rumor Mill" subtitle="Fresh NIP drafts from the community lab." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {community.isLoading || draftsQuery.isLoading ? (
              <>
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : drafts.length > 0 ? (
              drafts.map((nip) => <NipCard key={nip.address} nip={draftToRanked(nip)} />)
            ) : (
              <Card className="border-dashed sm:col-span-2 lg:col-span-3">
                <CardContent className="px-8 py-12 text-center">
                  <p className="mx-auto max-w-sm text-muted-foreground">
                    The rumor mill is quiet.{' '}
                    <Link to="/create" className="font-medium text-primary hover:underline">
                      Start the next rumor
                    </Link>
                    .
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* ── Barcode strip ─────────────────────────────────────────── */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-foreground/80 pt-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="h-10 w-24 text-foreground/80 bg-[repeating-linear-gradient(90deg,currentColor_0,currentColor_2px,transparent_2px,transparent_5px)]"
            />
            <div className="font-mono text-[10px] uppercase leading-tight text-muted-foreground">
              <p>NostrHub Monthly · Vol. {now.getFullYear() - 2019}</p>
              <p>Display until the heat death of the universe</p>
            </div>
          </div>
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted-foreground">
            <Zap className="size-3 text-primary" aria-hidden="true" />
            Price: 0 sats · Free forever
          </p>
        </footer>
      </div>
    </Layout>
  );
};

export default Index;
