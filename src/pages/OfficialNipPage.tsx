import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { BookOpen, GitFork, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero, HeroExternalLink } from '@/components/DetailHero';
import { MarkdownContent } from '@/components/MarkdownContent';
import { ApproveButton } from '@/components/ApproveButton';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { RelatedReposCard, UsedByAppsCard } from '@/components/CrossRefCards';
import { useOfficialNip } from '@/hooks/useOfficialNips';
import { useAppsForOfficialNip } from '@/hooks/useAppsForNip';
import { uniqueRepoRefs } from '@/lib/apps';
import { cn } from '@/lib/utils';
import type { NipTarget } from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

  // NIP-89 listings referencing this NIP — the nexus of discoverability —
  // also surface the repos those apps are built from.
  const appsForNip = useAppsForOfficialNip(code || undefined);
  const apps = appsForNip.data ?? [];
  const repoRefs = uniqueRepoRefs(apps);

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
    <Layout className={apps.length > 0 ? 'max-w-6xl' : undefined}>
      <BackLink to="/">Back to NIPs</BackLink>

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
          <DetailHero
            icon={<BookOpen className="size-7 text-primary" aria-hidden="true" />}
            kicker={`NIP-${code}`}
            title={title}
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

          {/* Below the hero: NIP text + discussion on the left, cross-references
              from NIP-89 app listings on the right. */}
          <div
            className={cn(
              'mt-6 space-y-6',
              apps.length > 0 &&
                'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 lg:space-y-0',
            )}
          >
            <div className="min-w-0">
              <Card>
                <CardContent className="p-6">
                  <MarkdownContent content={data.content} />
                </CardContent>
              </Card>

              <section className="mt-10 space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
                <CommentsSection
                  root={new URL(`${GITHUB_BASE}/${code}.md`)}
                  emptyStateMessage="No discussion yet"
                  emptyStateSubtitle="Share feedback on this NIP with the community."
                />
              </section>
            </div>

            {apps.length > 0 && (
              <aside aria-label="NIP cross-references" className="space-y-4 lg:sticky lg:top-24">
                <UsedByAppsCard apps={apps} />
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
