import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Plus, Zap } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipCard } from '@/components/NipCard';
import { ExpertCoverStory } from '@/components/ExpertCoverStory';
import { ExpertFeatureCard } from '@/components/ExpertFeatureCard';
import { StatsSidebar } from '@/components/StatsSidebar';
import { ChatPreviewCard } from '@/components/ChatPreviewCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useRankedNips, type RankedNip } from '@/hooks/useRankedNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useExperts } from '@/hooks/useExperts';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { nipTargetKey } from '@/hooks/useNipApprovals';
import type { CustomNip } from '@/lib/nips';
import { shortNpub } from '@/lib/nostr';
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

/** Inline display name for the cover-lines strip. */
function ExpertName({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  return <>{metadata?.display_name || metadata?.name || shortNpub(pubkey)}</>;
}

/** Editorial department header: kicker, slab title, rule, and a dek. */
function Department({
  kicker,
  title,
  subtitle,
  action,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-nebula">
          {kicker}
        </span>
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-gradient-to-r from-nebula/50 via-primary/40 to-transparent"
        />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
          {title}
        </h2>
        {action}
      </div>
      {subtitle && <p className="max-w-2xl text-base text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
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
  const draftsQuery = useCustomNips({
    authors: community.data?.authors,
    limit: 30,
    enabled: !community.isLoading,
  });

  const hasExperts = experts.length > 0;
  const [coverStar, ...panel] = experts;
  const coverLineExperts = experts.slice(1, 5);

  // Issue numbering counted from Nostr's genesis (fiatjaf's first relay,
  // November 2020), so every month really is a new issue.
  const now = new Date();
  const issueNo = (now.getFullYear() - 2020) * 12 + now.getMonth() - 10 + 1;
  const issueDate = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Layout className="max-w-6xl">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="mb-10 space-y-4">
        <div className="flex items-center justify-between gap-3 border-y-2 border-foreground/80 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] sm:text-xs">
          <span>Issue No. {issueNo}</span>
          <span className="hidden sm:inline text-muted-foreground">{issueDate}</span>
          <span className="text-primary">The Future Issue</span>
        </div>

        <h1 className="text-center font-display text-6xl font-bold uppercase leading-[0.9] tracking-tighter sm:text-8xl lg:text-9xl">
          Nostr<span className="text-cosmic">Hub</span>
        </h1>
        <p className="text-center text-lg text-muted-foreground sm:text-xl">
          The people building the next internet — open, unstoppable, and shipping monthly.
        </p>

        {/* Cover lines */}
        <p className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 border-y border-border py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
          <span className="text-primary">Inside:</span>
          {coverLineExperts.map((pubkey) => (
            <span key={pubkey} className="flex items-center gap-2.5">
              <ExpertName pubkey={pubkey} />
              <span aria-hidden="true" className="text-nebula">✦</span>
            </span>
          ))}
          <span className="text-muted-foreground">
            {rankedLoading ? 'The expert-approved NIPs' : `${ranked.length} expert-approved NIPs`}
            {' '}+ the rumor mill
          </span>
        </p>
      </header>

      <div className="space-y-16">
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

        {/* ── Cover story ──────────────────────────────────────────── */}
        {coverStar && <ExpertCoverStory pubkey={coverStar} />}

        {/* ── Feature well: the expert panel ───────────────────────── */}
        {panel.length > 0 && (
          <section className="space-y-6" aria-label="The expert panel">
            <Department
              kicker="Dept. 01 · Features"
              title="The Expert Panel"
              subtitle="The minds steering the protocol. Their approvals decide what makes print."
              action={
                <Link
                  to="/experts"
                  className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
                >
                  Meet the full panel →
                </Link>
              }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {panel.map((pubkey, i) => (
                <ExpertFeatureCard key={pubkey} pubkey={pubkey} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ── The review section: expert-approved NIPs ─────────────── */}
        <section className="space-y-6" aria-label="Expert-approved NIPs">
          <Department
            kicker="Dept. 02 · Reviews"
            title="The Review Section"
            subtitle="Every NIP below earned the panel's seal. Rated, stamped, shipped."
          />
          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
            {rankedLoading ? (
              <>
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : ranked.length > 0 ? (
              ranked.map((nip, i) =>
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

        {/* ── Rumor mill: fresh community drafts ───────────────────── */}
        <section className="space-y-6" aria-label="Latest community drafts">
          <Department
            kicker="Dept. 03 · Previews"
            title="The Rumor Mill"
            subtitle="Unreviewed. Unreleased. Unbelievably close. Fresh drafts straight from the community lab."
            action={
              user && (
                <Button asChild size="sm" className="gap-1.5 rounded-full shadow-lg shadow-primary/25">
                  <Link to="/create">
                    <Plus className="size-4" />
                    Submit a story
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
            ) : draftsQuery.data && draftsQuery.data.length > 0 ? (
              draftsQuery.data.map((nip) => (
                <NipCard key={nip.address} nip={draftToRanked(nip)} />
              ))
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

        {/* ── Back of the book ─────────────────────────────────────── */}
        <section className="space-y-6" aria-label="Community dispatches and network stats">
          <Department
            kicker="Dept. 04 · Back of the Book"
            title="Letters & Numbers"
            subtitle="Live dispatches from the community wire, and the network by the numbers."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChatPreviewCard />
            <StatsSidebar />
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
