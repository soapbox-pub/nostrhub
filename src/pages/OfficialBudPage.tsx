import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { GitFork, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero, HeroExternalLink } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { HighlightableMarkdown } from '@/components/HighlightableMarkdown';
import { budHighlightSource } from '@/lib/highlightSource';
import { ApproveButton } from '@/components/ApproveButton';
import { FollowNipButton } from '@/components/FollowNipButton';
import { ExpertApprovers } from '@/components/ExpertApprovers';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { RelatedReposCard, UsedByAppsCard, ForksCard } from '@/components/CrossRefCards';
import { LinkAppNudge } from '@/components/LinkAppNudge';
import { useBud } from '@/hooks/useBuds';
import { useAppsForBud } from '@/hooks/useAppsForNip';
import { useForksOfBud } from '@/hooks/useForksOfNip';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { budGithubUrl, uniqueRepoRefs } from '@/lib/apps';
import { cn } from '@/lib/utils';
import type { NipTarget } from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

function extractTitle(content: string, fallback: string): string {
  // BUD bodies open with a "# BUD-NN" heading followed by a "## Title" heading;
  // prefer the descriptive second-level heading, falling back to the first.
  const lines = content.split('\n');
  const h2 = lines.find((l) => l.startsWith('## '));
  if (h2) return h2.replace(/^##\s+/, '').trim();
  const h1 = lines.find((l) => l.startsWith('# '));
  return h1 ? h1.replace(/^#\s+/, '').trim() : fallback;
}

const OfficialBudPage = () => {
  const { number } = useParams<{ number: string }>();
  const code = number ?? '';
  const { data, isLoading, isError } = useBud(code);
  const { user } = useCurrentUser();

  // NIP-89 listings referencing this BUD — the nexus of discoverability —
  // also surface the repos those apps are built from.
  const appsForBud = useAppsForBud(code || undefined);
  const apps = appsForBud.data ?? [];
  const repoRefs = uniqueRepoRefs(apps);

  // Community forks of this BUD, expert forks first.
  const forksQuery = useForksOfBud(code || undefined);
  const forks = forksQuery.data ?? [];

  // BUDs have no owner, so nudge any logged-in user to link an app
  // they've built that implements this BUD.
  const showSidebar = apps.length > 0 || forks.length > 0 || forksQuery.isLoading || Boolean(user);

  const title = useMemo(
    () => (data ? extractTitle(data.content, `BUD-${code}`) : `BUD-${code}`),
    [data, code],
  );

  useSeoMeta({
    title: `BUD-${code}${data ? ` — ${title}` : ''} | NostrHub`,
    description: `Read and approve Blossom BUD-${code} on NostrHub.`,
  });

  const target: NipTarget = { type: 'bud', number: code };
  const githubUrl = budGithubUrl(code);

  return (
    <Layout className={showSidebar ? 'max-w-6xl' : undefined}>
      <BackLink to="/nips">Back to NIPs</BackLink>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      ) : isError || !data ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>Could not load BUD-{code}. It may not exist.</AlertDescription>
        </Alert>
      ) : (
        <article>
          <DetailSurface>
          <DetailHero
            title={title}
            kicker={`BUD-${code}`}
            meta={<ExpertApprovers target={target} />}
            primaryAction={<ApproveButton target={target} />}
            actions={
              <>
                <FollowNipButton target={target} />
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link to={`/create?budFork=${code}`}>
                    <GitFork className="size-4" aria-hidden="true" /> Fork
                  </Link>
                </Button>
                <HeroExternalLink href={githubUrl}>GitHub</HeroExternalLink>
              </>
            }
          />
          </DetailSurface>

          {/* Below the hero: BUD text + discussion on the left, cross-references
              from NIP-89 app listings on the right. */}
          <div
            className={cn(
              'mt-6 space-y-6',
              showSidebar &&
                'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 lg:space-y-0',
            )}
          >
            <DetailSurface className="min-w-0">
              <HighlightableMarkdown content={data.content} source={budHighlightSource(code)} />

              <section className="mt-10 space-y-4 border-t border-border/60 pt-6">
                <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
                <CommentsSection
                  root={new URL(githubUrl)}
                  emptyStateMessage="No discussion yet"
                  emptyStateSubtitle="Share feedback on this BUD with the community."
                />
              </section>
            </DetailSurface>

            {showSidebar && (
              <aside aria-label="BUD cross-references" className="space-y-4 lg:sticky lg:top-24">
                <LinkAppNudge
                  target={{ kind: 'bud', number: code, label: `BUD-${code}` }}
                  linkedApps={apps}
                />
                <UsedByAppsCard apps={apps} />
                <ForksCard forks={forks} isLoading={forksQuery.isLoading} />
                <RelatedReposCard repoRefs={repoRefs} />
              </aside>
            )}
          </div>
        </article>
      )}
    </Layout>
  );
};

export default OfficialBudPage;
