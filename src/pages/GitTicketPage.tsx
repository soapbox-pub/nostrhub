import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  GitMerge,
  GitPullRequest,
  XCircle,
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { MarkdownContent } from '@/components/MarkdownContent';
import { TicketTimeline } from '@/components/git/TicketTimeline';
import { useGitTicket } from '@/hooks/useGitTicket';
import { useGitRepo } from '@/hooks/useGitRepo';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useRepoUrl } from '@/hooks/useRepoUrl';
import { shortNpub } from '@/lib/nostr';
import { GIT_ISSUE_KIND, type GitItemStatus } from '@/lib/git';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface GitTicketPageProps {
  /** The issue/merge-request event id (hex). */
  eventId: string;
}

const STATUS_META: Record<
  GitItemStatus,
  { label: string; icon: typeof CircleDot; className: string }
> = {
  open: { label: 'Open', icon: CircleDot, className: 'bg-chart-5 text-white' },
  draft: { label: 'Draft', icon: CircleDashed, className: 'bg-muted-foreground text-background' },
  closed: { label: 'Closed', icon: XCircle, className: 'bg-destructive text-destructive-foreground' },
  merged: { label: 'Merged', icon: GitMerge, className: 'bg-nebula text-white' },
  resolved: { label: 'Resolved', icon: CheckCircle2, className: 'bg-nebula text-white' },
};

/** GitHub-style filled status pill. */
function StatusPill({ status }: { status: GitItemStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold',
        meta.className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" /> {meta.label}
    </span>
  );
}

function TicketSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-6 w-1/2" />
      <div className="h-px bg-border" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

/**
 * Detail page for a NIP-34 issue (kind 1621) or merge request (kind 1618),
 * laid out like a GitHub issue/PR: a full-width title with a `#shortid`, a
 * status pill + "opened this …" meta line, then a timeline of avatar-gutter
 * comment cards starting with the original post's Markdown body.
 */
export function GitTicketPage({ eventId }: GitTicketPageProps) {
  const { data: ticket, isLoading, isError } = useGitTicket(eventId);
  const author = useAuthor(ticket?.pubkey ?? '');
  const authorUrl = useProfileUrl(ticket?.pubkey ?? '', author.data?.metadata);
  const authorName =
    author.data?.metadata?.name ||
    author.data?.metadata?.display_name ||
    (ticket ? shortNpub(ticket.pubkey) : '');

  // Resolve the parent repo (for the crumb + back link). Parsing an absent
  // address yields empty strings, which the hooks tolerate before load.
  const [, repoPubkey = '', repoIdentifier = ''] = (ticket?.repoAddress ?? '').split(':');
  const { data: repoData } = useGitRepo({ pubkey: repoPubkey, identifier: repoIdentifier });
  const repoUrl = useRepoUrl(repoPubkey, repoIdentifier);
  const repoName = repoData?.repo?.name ?? repoIdentifier;
  const hasRepo = Boolean(ticket?.repoAddress);

  const isIssue = ticket?.kind === GIT_ISSUE_KIND;
  const noun = isIssue ? 'Issue' : 'Merge request';
  const verb = isIssue ? 'issue' : 'merge request';
  const shortId = eventId.slice(0, 7);

  useSeoMeta({
    title: ticket ? `${ticket.subject} · ${repoName || 'Git'} | NostrHub` : `${noun} | NostrHub`,
  });

  return (
    <Layout className="max-w-6xl">
      <BackLink to={hasRepo ? `${repoUrl}?tab=${isIssue ? 'issues' : 'pulls'}` : '/repos'}>
        {hasRepo ? `Back to ${repoName || 'repository'}` : 'Back to Repositories'}
      </BackLink>

      {isLoading ? (
        <TicketSkeleton />
      ) : isError || !ticket ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Could not find this {verb}. It may not have reached your relays yet.
          </AlertDescription>
        </Alert>
      ) : (
        <article className="space-y-6">
          {/* ——— Title + meta ——— */}
          <header className="space-y-3 border-b pb-5">
            <h1 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {ticket.subject}{' '}
              <span className="font-normal text-muted-foreground">#{shortId}</span>
            </h1>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted-foreground">
              <StatusPill status={ticket.status} />
              {!isIssue && (
                <span className="inline-flex items-center gap-1">
                  <GitPullRequest className="size-4" aria-hidden="true" />
                </span>
              )}
              <span className="flex flex-wrap items-center gap-1">
                <Link to={authorUrl} className="font-semibold text-foreground hover:text-primary">
                  {authorName}
                </Link>
                <span>
                  opened this {verb}{' '}
                  {formatDistanceToNow(new Date(ticket.createdAt * 1000), { addSuffix: true })}
                </span>
                {hasRepo && (
                  <>
                    <span aria-hidden="true">in</span>
                    <Link to={repoUrl} className="font-semibold text-primary hover:underline">
                      {repoName}
                    </Link>
                  </>
                )}
              </span>
            </div>

            {ticket.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ticket.labels.map((label) => (
                  <Badge key={label} variant="secondary" className="font-normal">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </header>

          {/* ——— Conversation timeline ——— */}
          <DetailSurface className="!p-5 sm:!p-6">
            <TicketTimeline
              root={ticket.event}
              authorPubkey={ticket.pubkey}
              original={
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5 text-sm">
                    <Link to={authorUrl} className="font-semibold hover:text-primary">
                      {authorName}
                    </Link>
                    <span className="text-muted-foreground">
                      commented{' '}
                      {formatDistanceToNow(new Date(ticket.createdAt * 1000), { addSuffix: true })}
                    </span>
                    <Badge
                      variant="outline"
                      className="ml-auto text-[10px] font-normal text-muted-foreground"
                    >
                      author
                    </Badge>
                  </div>
                  <div className="p-4 sm:p-5">
                    {ticket.content.trim() ? (
                      <MarkdownContent content={ticket.content} />
                    ) : (
                      <p className="text-sm italic text-muted-foreground">
                        No description provided.
                      </p>
                    )}
                  </div>
                </div>
              }
            />
          </DetailSurface>
        </article>
      )}
    </Layout>
  );
}

export default GitTicketPage;
