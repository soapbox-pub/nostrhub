import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { ArrowLeft, Blocks, GitFork, AlertCircle, Pencil } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { MarkdownContent } from '@/components/MarkdownContent';
import { ApproveButton } from '@/components/ApproveButton';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { ExpertToggleButton } from '@/components/ExpertToggleButton';
import { useCustomNip } from '@/hooks/useCustomNips';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppsForCustomNip } from '@/hooks/useAppsForNip';
import { shortNpub } from '@/lib/nostr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import type { NipTarget } from '@/hooks/useNipApprovals';
import type { AppInfo } from '@/lib/apps';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** A compact app card for the cross-reference list. */
function AppChip({ app }: { app: AppInfo }) {
  const icon = sanitizeUrl(app.picture);
  return (
    <Link
      to={`/${app.naddr}`}
      className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
        {icon
          ? <img src={icon} alt="" className="size-full object-cover" />
          : <Blocks className="size-4 text-muted-foreground" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{app.name}</span>
    </Link>
  );
}

/** Detail view for a community-authored NIP (kind 30817), routed via its naddr. */
export function CustomNipPage({ naddr }: { naddr: string }) {
  const { data: nip, isLoading, isError } = useCustomNip(naddr);
  const { user } = useCurrentUser();
  const author = useAuthor(nip?.author);
  const authorName =
    author.data?.metadata?.name || author.data?.metadata?.display_name || (nip ? shortNpub(nip.author) : '');
  const appsForNip = useAppsForCustomNip(nip?.address);

  useSeoMeta({
    title: nip ? `${nip.title} | NostrHub` : 'NIP | NostrHub',
    description: nip ? `${nip.title} — a community NIP on NostrHub.` : undefined,
  });

  const target: NipTarget | null = nip ? { type: 'custom', address: nip.address } : null;
  const isOwner = !!user && !!nip && user.pubkey === nip.author;

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to="/">
          <ArrowLeft className="mr-1.5 size-4" /> Back to NIPs
        </Link>
      </Button>

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
          <header className="space-y-4 border-b border-border/60 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <GitFork className="size-3" /> Community NIP
              </Badge>
              {nip.kinds.map((k) => (
                <Badge key={k} variant="outline" className="font-mono text-xs">
                  kind {k}
                </Badge>
              ))}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{nip.title}</h1>

            <div className="flex flex-wrap items-center gap-3">
              <Link to={`/${nip19.npubEncode(nip.author)}`} className="flex items-center gap-2 hover:text-primary">
                <UserAvatar pubkey={nip.author} size="sm" />
                <span className="text-sm font-medium">{authorName}</span>
              </Link>
              <ExpertToggleButton pubkey={nip.author} iconOnly />
            </div>

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

            <div className="flex flex-wrap items-center justify-between gap-4">
              <ApproveButton target={target} />
              <div className="flex gap-2">
                {isOwner && (
                  <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link to={`/edit/${nip.naddr}`}>
                      <Pencil className="size-4" /> Edit
                    </Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link to={`/create?fork=${nip.naddr}`}>
                    <GitFork className="size-4" /> Fork
                  </Link>
                </Button>
              </div>
            </div>
          </header>

          <Card className="mt-6">
            <CardContent className="p-6">
              <MarkdownContent content={nip.content} />
            </CardContent>
          </Card>

          {(appsForNip.data?.length ?? 0) > 0 && (
            <section className="mt-8 space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Used by apps</h2>
              <p className="text-sm text-muted-foreground">
                Nostr apps that declare they implement this NIP.
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {appsForNip.data!.map((app) => (
                  <AppChip key={app.address} app={app} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-10 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
            <CommentsSection
              root={nip.event}
              emptyStateMessage="No discussion yet"
              emptyStateSubtitle="Share feedback on this NIP with the community."
            />
          </section>
        </article>
      )}
    </Layout>
  );
}

export default CustomNipPage;
