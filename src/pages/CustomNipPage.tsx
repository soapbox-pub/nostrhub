import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { BookOpen, GitFork, AlertCircle, Pencil } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { MarkdownContent } from '@/components/MarkdownContent';
import { ApproveButton } from '@/components/ApproveButton';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { ExpertToggleButton } from '@/components/ExpertToggleButton';
import { RelatedReposCard, UsedByAppsCard } from '@/components/CrossRefCards';
import { KindBadge } from '@/components/KindBadge';
import { useCustomNip } from '@/hooks/useCustomNips';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppsForCustomNip } from '@/hooks/useAppsForNip';
import { shortNpub } from '@/lib/nostr';
import { uniqueRepoRefs } from '@/lib/apps';
import { cn } from '@/lib/utils';
import type { NipTarget } from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** Detail view for a community-authored NIP (kind 30817), routed via its naddr. */
export function CustomNipPage({ naddr }: { naddr: string }) {
  const { data: nip, isLoading, isError } = useCustomNip(naddr);
  const { user } = useCurrentUser();
  const author = useAuthor(nip?.author);
  const authorName =
    author.data?.metadata?.name || author.data?.metadata?.display_name || (nip ? shortNpub(nip.author) : '');
  const appsForNip = useAppsForCustomNip(nip?.address);

  // The NIP-89 listing is the nexus: apps point at both this NIP and the
  // repos implementing it, giving us related repos by association.
  const apps = appsForNip.data ?? [];
  const repoRefs = uniqueRepoRefs(apps);

  useSeoMeta({
    title: nip ? `${nip.title} | NostrHub` : 'NIP | NostrHub',
    description: nip ? `${nip.title}: a community NIP on NostrHub.` : undefined,
  });

  const target: NipTarget | null = nip ? { type: 'custom', address: nip.address } : null;
  const isOwner = !!user && !!nip && user.pubkey === nip.author;

  return (
    <Layout className={apps.length > 0 ? 'max-w-6xl' : undefined}>
      <BackLink to="/">Back to NIPs</BackLink>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      ) : isError || !nip || !target ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>Could not load this NIP. It may not exist on your relays.</AlertDescription>
        </Alert>
      ) : (
        <article>
          <DetailSurface>
          <DetailHero
            icon={<BookOpen className="size-7 text-primary" aria-hidden="true" />}
            title={nip.title}
            badges={
              <>
                <Badge variant="secondary" className="gap-1">
                  <GitFork className="size-3" /> Community NIP
                </Badge>
                {nip.kinds.map((k) => (
                  <KindBadge key={k} kind={k} />
                ))}
              </>
            }
            meta={
              <>
                <Link to={`/${nip19.npubEncode(nip.author)}`} className="flex items-center gap-2 hover:text-primary">
                  <UserAvatar pubkey={nip.author} size="sm" />
                  <span className="text-sm font-medium text-foreground">{authorName}</span>
                </Link>
                <ExpertToggleButton pubkey={nip.author} iconOnly />
              </>
            }
            primaryAction={<ApproveButton target={target} />}
            actions={
              <>
                {isOwner && (
                  <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link to={`/edit/${nip.naddr}`}>
                      <Pencil className="size-4" aria-hidden="true" /> Edit
                    </Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link to={`/create?fork=${nip.naddr}`}>
                    <GitFork className="size-4" aria-hidden="true" /> Fork
                  </Link>
                </Button>
              </>
            }
          >
            {nip.fork && (
              <p className="text-sm text-muted-foreground">
                Forked from{' '}
                {nip.fork.type === 'official' ? (
                  <a href={nip.fork.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    an official NIP
                  </a>
                ) : (
                  <span className="font-mono">{nip.fork.address}</span>
                )}
              </p>
            )}
          </DetailHero>
          </DetailSurface>

          {/* Below the hero: NIP text + discussion on the left, cross-references
              from NIP-89 app listings on the right. */}
          <div
            className={cn(
              'mt-6 space-y-6',
              apps.length > 0 &&
                'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 lg:space-y-0',
            )}
          >
            <DetailSurface className="min-w-0">
              <MarkdownContent content={nip.content} />

              <section className="mt-10 space-y-4 border-t border-border/60 pt-6">
                <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
                <CommentsSection
                  root={nip.event}
                  emptyStateMessage="No discussion yet"
                  emptyStateSubtitle="Share feedback on this NIP with the community."
                />
              </section>
            </DetailSurface>

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
}

export default CustomNipPage;
