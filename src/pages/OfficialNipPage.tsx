import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { GitFork, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero, HeroExternalLink } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { MarkdownContent } from '@/components/MarkdownContent';
import { ApproveButton } from '@/components/ApproveButton';
import { ExpertApprovers } from '@/components/ExpertApprovers';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { RelatedReposCard, UsedByAppsCard, ExpertForksCard } from '@/components/CrossRefCards';
import { LinkAppNudge } from '@/components/LinkAppNudge';
import { useOfficialNip } from '@/hooks/useOfficialNips';
import { useAppsForOfficialNip } from '@/hooks/useAppsForNip';
import { useForksOfOfficialNip } from '@/hooks/useForksOfNip';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { uniqueRepoRefs } from '@/lib/apps';
import { cn } from '@/lib/utils';
import type { NipTarget } from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

const GITHUB_BASE = 'https://github.com/nostr-protocol/nips/blob/master';

function extractTitle(content: string, fallback: string): string {
  const line = content.split('\n').find((l) => l.startsWith('# '));
  return line ? line.replace(/^#\s+/, '').trim() : fallback;
}

const OfficialNipPage = () => {
  const { number } = useParams<{ number: string }>();
  const code = (number ?? '').toUpperCase();
  const { data, isLoading, isError } = useOfficialNip(code);
  const { user } = useCurrentUser();

  // NIP-89 listings referencing this NIP — the nexus of discoverability —
  // also surface the repos those apps are built from.
  const appsForNip = useAppsForOfficialNip(code || undefined);
  const apps = appsForNip.data ?? [];
  const repoRefs = uniqueRepoRefs(apps);

  // Expert-authored forks of this NIP (curation signal).
  const forksQuery = useForksOfOfficialNip(code || undefined);
  const forks = forksQuery.data ?? [];

  // Official NIPs have no owner, so nudge any logged-in user to link an app
  // they've built that implements this NIP.
  const showSidebar = apps.length > 0 || forks.length > 0 || forksQuery.isLoading || Boolean(user);

  const title = useMemo(
    () => (data ? extractTitle(data.content, `NIP-${code}`) : `NIP-${code}`),
    [data, code],
  );

  useSeoMeta({
    title: `NIP-${code}${data ? ` — ${title}` : ''} | NostrHub`,
    description: `Read and approve NIP-${code} on NostrHub.`,
  });

  const target: NipTarget = { type: 'official', number: code };

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
          <AlertDescription>Could not load NIP-{code}. It may not exist.</AlertDescription>
        </Alert>
      ) : (
        <article>
          <DetailSurface>
          <DetailHero
            title={title}
            meta={<ExpertApprovers target={target} />}
            primaryAction={<ApproveButton target={target} />}
            actions={
              <>
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link to={`/create?officialFork=${code}`}>
                    <GitFork className="size-4" aria-hidden="true" /> Fork
                  </Link>
                </Button>
                <HeroExternalLink href={`${GITHUB_BASE}/${code}.md`}>GitHub</HeroExternalLink>
              </>
            }
          />
          </DetailSurface>

          {/* Below the hero: NIP text + discussion on the left, cross-references
              from NIP-89 app listings on the right. */}
          <div
            className={cn(
              'mt-6 space-y-6',
              showSidebar &&
                'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 lg:space-y-0',
            )}
          >
            <DetailSurface className="min-w-0">
              <MarkdownContent content={data.content} />

              <section className="mt-10 space-y-4 border-t border-border/60 pt-6">
                <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
                <CommentsSection
                  root={new URL(`${GITHUB_BASE}/${code}.md`)}
                  emptyStateMessage="No discussion yet"
                  emptyStateSubtitle="Share feedback on this NIP with the community."
                />
              </section>
            </DetailSurface>

            {showSidebar && (
              <aside aria-label="NIP cross-references" className="space-y-4 lg:sticky lg:top-24">
                <LinkAppNudge
                  target={{ kind: 'officialNip', number: code, label: `NIP-${code}` }}
                  linkedApps={apps}
                />
                <UsedByAppsCard apps={apps} />
                <ExpertForksCard forks={forks} isLoading={forksQuery.isLoading} />
                <RelatedReposCard repoRefs={repoRefs} />
              </aside>
            )}
          </div>
        </article>
      )}
    </Layout>
  );
};

export default OfficialNipPage;
