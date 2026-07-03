import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  XCircle,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Layout } from '@/components/Layout';
import { BackLink } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { MarkdownContent } from '@/components/MarkdownContent';
import { PatchDiff } from '@/components/git/PatchDiff';
import { TicketTimeline } from '@/components/git/TicketTimeline';
import { UserAvatar } from '@/components/UserAvatar';
import { useGitTicket, type SingleGitTicket } from '@/hooks/useGitTicket';
import { useGitRepo } from '@/hooks/useGitRepo';
import { useAheadBehind } from '@/hooks/useAheadBehind';
import { useAuthor } from '@/hooks/useAuthor';
import { useComments } from '@/hooks/useComments';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useRepoUrl } from '@/hooks/useRepoUrl';
import { shortNpub } from '@/lib/nostr';
import {
  GIT_ISSUE_KIND,
  GIT_PATCH_KIND,
  GIT_PR_KIND,
  shortCommit,
  type GitItemStatus,
} from '@/lib/git';
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
  applied: { label: 'Applied', icon: CheckCircle2, className: 'bg-nebula text-white' },
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

/** A titled sidebar section, GitHub-style. */
function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 py-4 first:pt-0 last:pb-0">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A participant avatar linking to their profile. */
function ParticipantAvatar({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const profileUrl = useProfileUrl(pubkey, author.data?.metadata);
  const name =
    author.data?.metadata?.name ||
    author.data?.metadata?.display_name ||
    shortNpub(pubkey);
  return (
    <Link
      to={profileUrl}
      title={name}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <UserAvatar pubkey={pubkey} size="sm" />
    </Link>
  );
}

/**
 * Everyone in the conversation: author, commenters, status issuers, updaters.
 * Shares the comments cache with the timeline (same root/limit/authors key).
 */
function Participants({ ticket }: { ticket: SingleGitTicket }) {
  const community = useCommunityAuthors();
  const { data: commentsData } = useComments(ticket.event, {
    limit: 500,
    communityAuthors: community.data?.authors,
  });
  const participants = [
    ...new Set([
      ticket.pubkey,
      ...(commentsData?.allComments ?? []).map((c) => c.pubkey),
      ...ticket.statusEvents.map((s) => s.pubkey),
      ...ticket.prUpdates.map((u) => u.pubkey),
    ]),
  ];

  return (
    <SidebarSection title={`Participants · ${participants.length}`}>
      <div className="flex flex-wrap gap-1.5">
        {participants.slice(0, 14).map((pubkey) => (
          <ParticipantAvatar key={pubkey} pubkey={pubkey} />
        ))}
        {participants.length > 14 && (
          <span className="grid size-8 place-items-center rounded-full bg-muted text-xs text-muted-foreground">
            +{participants.length - 14}
          </span>
        )}
      </div>
    </SidebarSection>
  );
}

/** Inline `<code>` chip for a commit id. */
function CommitChip({ commit }: { commit: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {shortCommit(commit)}
    </code>
  );
}

/**
 * Detail page for a NIP-34 issue (kind 1621), merge request (kind 1618), or
 * patch (kind 1617), laid out like a GitHub issue/PR: a full-width title with
 * a `#shortid`, a status pill + "opened this …" meta line, a timeline of
 * comments and lifecycle events, and a sidebar with labels, participants, and
 * (for MRs) branch/commit details with ahead-behind counts.
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
  const headBranch = repoData?.state?.headBranch;

  const isIssue = ticket?.kind === GIT_ISSUE_KIND;
  const isPatch = ticket?.kind === GIT_PATCH_KIND;
  const isMr = ticket?.kind === GIT_PR_KIND;
  const noun = isIssue ? 'Issue' : isPatch ? 'Patch' : 'Merge request';
  const verb = noun.toLowerCase();
  const shortId = eventId.slice(0, 7);

  // Ahead/behind for MRs, computed against the repo's default branch.
  const aheadBehind = useAheadBehind({ repo: repoData?.repo, headBranch, ticket });

  useSeoMeta({
    title: ticket ? `${ticket.subject} · ${repoName || 'Git'} | NostrHub` : `${noun} | NostrHub`,
  });

  return (
    <Layout wide className="max-w-none">
      <BackLink
        to={hasRepo ? (isPatch ? repoUrl : `${repoUrl}?tab=${isIssue ? 'issues' : 'pulls'}`) : '/repos'}
      >
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
                  {isPatch ? (
                    <FileDiff className="size-4" aria-hidden="true" />
                  ) : (
                    <GitPullRequest className="size-4" aria-hidden="true" />
                  )}
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
              {isMr && ticket.branchName && (
                <span className="inline-flex items-center gap-1.5">
                  <GitBranch className="size-4" aria-hidden="true" />
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {ticket.branchName}
                  </code>
                  {headBranch && (
                    <>
                      <span aria-hidden="true">→</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {headBranch}
                      </code>
                    </>
                  )}
                </span>
              )}
            </div>
          </header>

          {/* ——— Conversation + sidebar ——— */}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <DetailSurface className="!p-5 sm:!p-6">
              <TicketTimeline
                root={ticket.event}
                authorPubkey={ticket.pubkey}
                statusEvents={ticket.statusEvents}
                prUpdates={ticket.prUpdates}
                ticketKind={ticket.kind}
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
                      {isPatch ? (
                        <PatchDiff content={ticket.content} />
                      ) : ticket.content.trim() ? (
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

            {/* ——— Sidebar ——— */}
            <aside className="order-first divide-y divide-border/60 lg:order-none lg:self-start">
              <SidebarSection title="Labels">
                {ticket.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {ticket.labels.map((label) => (
                      <Badge key={label} variant="secondary" className="font-normal">
                        {label}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">None yet</p>
                )}
              </SidebarSection>

              <Participants ticket={ticket} />

              {(isMr || isPatch) && (
                <SidebarSection title="Commits">
                  <dl className="space-y-1.5 text-sm">
                    {ticket.tipCommit && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Tip</dt>
                        <dd><CommitChip commit={ticket.tipCommit} /></dd>
                      </div>
                    )}
                    {ticket.mergeBase && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Merge base</dt>
                        <dd><CommitChip commit={ticket.mergeBase} /></dd>
                      </div>
                    )}
                    {ticket.mergeInfo?.mergeCommit && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Merged as</dt>
                        <dd><CommitChip commit={ticket.mergeInfo.mergeCommit} /></dd>
                      </div>
                    )}
                    {ticket.mergeInfo && ticket.mergeInfo.appliedCommits.length > 0 && (
                      <div className="flex items-start justify-between gap-2">
                        <dt className="text-muted-foreground">Applied as</dt>
                        <dd className="flex flex-wrap justify-end gap-1">
                          {ticket.mergeInfo.appliedCommits.map((c) => (
                            <CommitChip key={c} commit={c} />
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {isMr && (
                    <div className="flex items-center gap-1.5 pt-1 text-sm text-muted-foreground">
                      <GitCommitHorizontal className="size-4 shrink-0" aria-hidden="true" />
                      {aheadBehind.isLoading ? (
                        <Skeleton className="h-4 w-32" />
                      ) : aheadBehind.data && aheadBehind.data.ahead !== null ? (
                        <span>
                          <span className="font-semibold text-foreground">
                            {aheadBehind.data.ahead}
                          </span>{' '}
                          ahead
                          {aheadBehind.data.behind !== null && (
                            <>
                              ,{' '}
                              <span className="font-semibold text-foreground">
                                {aheadBehind.data.behind}
                              </span>{' '}
                              behind
                            </>
                          )}
                          {aheadBehind.data.targetRef && (
                            <>
                              {' '}
                              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                                {aheadBehind.data.targetRef}
                              </code>
                            </>
                          )}
                        </span>
                      ) : (
                        <span>Ahead/behind unavailable</span>
                      )}
                    </div>
                  )}
                </SidebarSection>
              )}

              <SidebarSection title="Reference">
                <code className="block break-all rounded bg-muted px-2 py-1.5 font-mono text-xs text-muted-foreground">
                  {nip19.neventEncode({ id: eventId, kind: ticket.kind })}
                </code>
              </SidebarSection>
            </aside>
          </div>
        </article>
      )}
    </Layout>
  );
}

export default GitTicketPage;
