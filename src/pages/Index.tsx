import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipCard } from '@/components/NipCard';
import { LeadArticleCard, ArticleCard } from '@/components/ArticleCards';
import { PulseQuoteCard } from '@/components/PulseQuoteCard';
import { DemoReelCard } from '@/components/DemoReelCard';
import { AppCard, AppCardSkeleton } from '@/components/AppCard';
import { UserAvatar } from '@/components/UserAvatar';
import { useExpertPress } from '@/hooks/useExpertPress';
import { useNostrSearch } from '@/hooks/useNostrSearch';
import { useApps } from '@/hooks/useApps';
import { useRankedNips, customToRanked } from '@/hooks/useRankedNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useExperts } from '@/hooks/useExperts';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { noteExcerpt } from '@/lib/noteText';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';

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
      'NostrHub is where the developer community collaborates on building the Nostr protocol. Discover, draft, and discuss NIPs together.',
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

  // NIP-50: hot-ranked sweep of the search relays for fresh launches, scoped to
  // the community author set so the firehose can't leak in. Ditto's NIP-50 runs
  // on OpenSearch, which analyzes the query into ORed, order-independent tokens
  // — so we use single high-signal launch verbs (one per filter) rather than
  // multi-word phrases, which would just OR their tokens together and dilute the
  // `sort:hot` ranking. Topicality comes from the community scope, not the words.
  const demoSearch = useNostrSearch({
    searches: [
      'released sort:hot',
      'releasing sort:hot',
      'shipped sort:hot',
      'launched sort:hot',
      'introducing sort:hot',
    ],
    kinds: [1],
    authors: community.data?.authors,
    sinceDays: 30,
    limit: 20,
    enabled: !community.isLoading && (community.data?.authors.length ?? 0) > 0,
  });

  const hasExperts = experts.length > 0;
  const hasCommunity = (community.data?.authors.length ?? 0) > 0;

  // The demo reel waits on the community set before its search can run; treat
  // "community still loading" as part of the demo loading state.
  const demoLoading = community.isLoading || (hasCommunity && demoSearch.isLoading);

  // Recent NIP-89 app listings published by the experts themselves.
  const expertApps = useApps({ authors: experts, limit: 50, enabled: hasExperts });

  // Hero avatar stack: up to 5 expert avatars, then a "+N" overflow count.
  const shownExperts = experts.slice(0, 5);
  const extraExperts = experts.length - shownExperts.length;

  const articles = press.data?.articles ?? [];
  const [leadArticle, ...moreArticles] = articles;
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
  const showroomApps = (expertApps.data ?? []).slice(0, 3);

  return (
    <Layout className="max-w-6xl">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="relative mb-14 flex flex-col items-center gap-5 pt-8 text-center sm:pt-12">
        {/* Nebula halo behind the wordmark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
        />

        <h1 className="relative font-display text-6xl font-bold uppercase leading-[0.9] tracking-tighter sm:text-8xl">
          Nostr<span className="text-cosmic">Hub</span>
        </h1>

        <p className="relative text-lg text-muted-foreground sm:text-xl">
          The people building the next internet.
        </p>

        {hasExperts && (
          <div className="relative flex flex-col items-center gap-2">
            <Link
              to="/experts"
              aria-label="View all experts"
              className="rounded-full transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <AvatarGroup>
                {shownExperts.map((pubkey) => (
                  <UserAvatar key={pubkey} pubkey={pubkey} size="lg" />
                ))}
                {extraExperts > 0 && (
                  <AvatarGroupCount className="avatar-shield text-sm">+{extraExperts}</AvatarGroupCount>
                )}
              </AvatarGroup>
            </Link>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Curated by Nostr experts
            </span>
          </div>
        )}
      </header>

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
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to="/nips">Browse all NIPs</Link>
              </Button>
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

        {/* ── The demo reel (NIP-50 search, community-scoped) ──────── */}
        {hasCommunity && (demoLoading || demos.length > 0) && (
          <section className="space-y-5" aria-label="Fresh demos and launches from the community">
            <Department
              title="Shipping Now"
              subtitle="Demos and launches from across the community."
              accent="nebula"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {demoLoading ? (
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

        {/* ── The showroom (recent expert apps) ────────────────────── */}
        {hasExperts && (expertApps.isLoading || showroomApps.length > 0) && (
          <section className="space-y-5" aria-label="Recent apps published by the experts">
            <Department
              title="The Showroom"
              subtitle="Fresh apps straight from the panel's workbenches."
              action={
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link to="/apps">Browse all apps</Link>
                </Button>
              }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {expertApps.isLoading ? (
                <>
                  <AppCardSkeleton />
                  <AppCardSkeleton />
                  <AppCardSkeleton />
                </>
              ) : (
                showroomApps.map((app) => <AppCard key={app.address} app={app} />)
              )}
            </div>
          </section>
        )}

        {/* ── Rumor mill (fresh community drafts) ──────────────────── */}
        <section className="space-y-5" aria-label="Latest community drafts">
          <Department
            title="The Rumor Mill"
            subtitle="Fresh NIP drafts from the community lab."
            action={
              user && (
                <Button asChild size="sm" className="gap-1.5 rounded-full shadow-lg shadow-primary/25">
                  <Link to="/create">
                    <PenLine className="size-4" />
                    Draft a New NIP
                  </Link>
                </Button>
              )
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {community.isLoading || draftsQuery.isLoading ? (
              <>
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : drafts.length > 0 ? (
              drafts.map((nip) => <NipCard key={nip.address} nip={customToRanked(nip)} />)
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
      </div>
    </Layout>
  );
};

export default Index;
