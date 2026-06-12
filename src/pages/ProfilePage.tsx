import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { BadgeCheck, Blocks, FileText, FolderGit2, Globe, Zap } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { UserAvatar } from '@/components/UserAvatar';
import { NipCard, NipCardSkeleton } from '@/components/NipCard';
import { AppCard, AppCardSkeleton } from '@/components/AppCard';
import { ContributionChart } from '@/components/ContributionChart';
import { RepoList, RepoListItem, RepoListItemSkeleton } from '@/components/git/RepoListItem';
import { CopyButton } from '@/components/git/CopyButton';
import { ExpertToggleButton } from '@/components/ExpertToggleButton';
import { useAuthor } from '@/hooks/useAuthor';
import { useExperts } from '@/hooks/useExperts';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useGitRepos } from '@/hooks/useGitRepos';
import { useApps } from '@/hooks/useApps';
import { customToRanked, type RankedNip } from '@/hooks/useRankedNips';
import { shortNpub } from '@/lib/nostr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProfilePageProps {
  /** Hex pubkey of the profile owner. */
  pubkey: string;
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="px-8 py-12 text-center">
        <p className="mx-auto max-w-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

/** Public profile view for a Nostr user: kind-0 metadata plus their NIPs and repos. */
export function ProfilePage({ pubkey }: ProfilePageProps) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const { isExpert } = useExperts();

  const nipsQuery = useCustomNips({ authors: [pubkey] });
  const reposQuery = useGitRepos({ authors: [pubkey] });
  // Show all of this author's own listings, even with incomplete metadata.
  const appsQuery = useApps({ authors: [pubkey], requireFullMetadata: false });

  const npub = useMemo(() => {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return pubkey;
    }
  }, [pubkey]);

  const displayName = metadata?.display_name || metadata?.name || shortNpub(pubkey);
  const handle = metadata?.nip05;
  const about = metadata?.about;
  const website = sanitizeUrl(metadata?.website);
  const lightning = metadata?.lud16 || metadata?.lud06;
  const banner = sanitizeUrl(metadata?.banner);
  const expert = isExpert(pubkey);

  useSeoMeta({
    title: `${displayName} | NostrHub`,
    description: about ? about.slice(0, 160) : `${displayName} on NostrHub.`,
  });

  // Adapt this author's custom NIPs to the shape NipCard renders.
  const nips: RankedNip[] = useMemo(
    () => (nipsQuery.data ?? []).map(customToRanked),
    [nipsQuery.data],
  );

  const repos = reposQuery.data ?? [];
  const apps = appsQuery.data ?? [];

  return (
    <Layout className="max-w-5xl">
      <article className="space-y-6">
        {/* Banner */}
        <div
          className="relative isolate h-40 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/20 via-nebula/15 to-background sm:h-52"
          aria-hidden={banner ? undefined : 'true'}
        >
          {banner && (
            <img
              src={banner}
              alt=""
              className="absolute inset-0 size-full object-cover"
              loading="lazy"
            />
          )}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
        </div>

        {/* Header */}
        <header className="space-y-4 px-1 sm:px-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <UserAvatar
              pubkey={pubkey}
              size="lg"
              className="-mt-16 size-24 border-4 border-background shadow-lg sm:-mt-20 sm:size-28"
            />
            <ExpertToggleButton pubkey={pubkey} />
          </div>

          <div className="space-y-1.5">
            {author.isLoading && !metadata ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-40" />
              </div>
            ) : (
              <>
                <h1 className="flex flex-wrap items-center gap-2 font-display text-3xl font-bold tracking-tight">
                  <span className="break-words">{displayName}</span>
                  {expert && (
                    <BadgeCheck
                      className="size-6 shrink-0 text-primary"
                      aria-label="Nostr Expert"
                    />
                  )}
                </h1>
                {handle && <p className="text-muted-foreground">{handle}</p>}
              </>
            )}

            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="font-mono">{shortNpub(pubkey)}</span>
              <CopyButton value={npub} label="Copy npub" />
            </div>
          </div>

          {about && (
            <p className="max-w-prose whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
              {about}
            </p>
          )}

          {(website || lightning) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Globe className="size-4" aria-hidden="true" />
                  <span className="max-w-64 truncate">{website.replace(/^https:\/\//, '')}</span>
                </a>
              )}
              {lightning && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="size-4 text-nebula" aria-hidden="true" />
                  <span className="max-w-64 truncate">{lightning}</span>
                </span>
              )}
            </div>
          )}
        </header>

        {/* Activity over time */}
        <ContributionChart pubkey={pubkey} />

        {/* Contributions */}
        <Tabs defaultValue="nips" className="pt-2">
          <TabsList>
            <TabsTrigger value="nips" className="gap-1.5">
              <FileText className="size-4" aria-hidden="true" />
              NIPs
              {nipsQuery.data && nips.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  {nips.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="repos" className="gap-1.5">
              <FolderGit2 className="size-4" aria-hidden="true" />
              Repositories
              {reposQuery.data && repos.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  {repos.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="apps" className="gap-1.5">
              <Blocks className="size-4" aria-hidden="true" />
              Apps
              {appsQuery.data && apps.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  {apps.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nips" className="mt-4">
            {nipsQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <NipCardSkeleton key={i} />
                ))}
              </div>
            ) : nips.length === 0 ? (
              <EmptyState message={`${displayName} hasn't published any NIPs yet.`} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {nips.map((nip) => (
                  <NipCard key={nip.key} nip={nip} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="repos" className="mt-4">
            {reposQuery.isLoading ? (
              <RepoList>
                {Array.from({ length: 3 }).map((_, i) => (
                  <RepoListItemSkeleton key={i} />
                ))}
              </RepoList>
            ) : repos.length === 0 ? (
              <EmptyState message={`${displayName} hasn't announced any repositories yet.`} />
            ) : (
              <RepoList>
                {repos.map((repo) => (
                  <RepoListItem
                    key={`${repo.pubkey}:${repo.identifier}`}
                    repo={repo}
                    showAuthor={false}
                  />
                ))}
              </RepoList>
            )}
          </TabsContent>

          <TabsContent value="apps" className="mt-4">
            {appsQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <AppCardSkeleton key={i} />
                ))}
              </div>
            ) : apps.length === 0 ? (
              <EmptyState message={`${displayName} hasn't published any app listings yet.`} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {apps.map((app) => (
                  <AppCard key={app.address} app={app} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </article>
    </Layout>
  );
}

export default ProfilePage;
