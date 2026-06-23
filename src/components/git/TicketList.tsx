import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import {
  CircleDot,
  CheckCircle2,
  GitMerge,
  GitPullRequest,
  Search,
  X,
  XCircle,
  CircleDashed,
} from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import { GIT_ISSUE_KIND, type GitItemStatus } from '@/lib/git';
import type { GitTicketWithStatus } from '@/hooks/useGitTickets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Icon + tone for each lifecycle state, GitHub-style. */
const STATUS_META: Record<
  GitItemStatus,
  { label: string; icon: typeof CircleDot; className: string }
> = {
  open: { label: 'Open', icon: CircleDot, className: 'text-chart-5' },
  draft: { label: 'Draft', icon: CircleDashed, className: 'text-muted-foreground' },
  closed: { label: 'Closed', icon: XCircle, className: 'text-destructive' },
  merged: { label: 'Merged', icon: GitMerge, className: 'text-nebula' },
  resolved: { label: 'Resolved', icon: CheckCircle2, className: 'text-nebula' },
};

const OPEN_STATES: GitItemStatus[] = ['open', 'draft'];
function isOpen(status: GitItemStatus): boolean {
  return OPEN_STATES.includes(status);
}

type StatusFilter = 'open' | 'closed' | 'all';

function TicketRow({ ticket }: { ticket: GitTicketWithStatus }) {
  const author = useAuthor(ticket.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || metadata?.display_name || shortNpub(ticket.pubkey);
  const nevent = nip19.neventEncode({
    id: ticket.event.id,
    author: ticket.pubkey,
    kind: ticket.kind,
  });

  const meta = STATUS_META[ticket.status];
  const StatusIcon = meta.icon;
  const isIssue = ticket.kind === GIT_ISSUE_KIND;

  return (
    <li className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/10">
      <StatusIcon
        className={cn('mt-0.5 size-5 shrink-0', meta.className)}
        aria-label={meta.label}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/${nevent}`}
            className="font-medium leading-snug hover:text-primary focus-visible:outline-none focus-visible:underline"
          >
            {ticket.subject}
          </Link>
          {!isIssue && (
            <GitPullRequest className="size-3.5 shrink-0 text-muted-foreground" aria-label="Merge request" />
          )}
          {ticket.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-[10px] font-normal">
              {label}
            </Badge>
          ))}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserAvatar pubkey={ticket.pubkey} size="sm" className="size-4" />
          <span className="truncate">{name}</span>
          <span aria-hidden="true">·</span>
          <span>
            opened {formatDistanceToNow(new Date(ticket.createdAt * 1000), { addSuffix: true })}
          </span>
        </p>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <Card className="overflow-hidden py-0">
      <ul className="divide-y divide-border/60">
        {[...Array(3)].map((_, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3">
            <Skeleton className="mt-0.5 size-5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface TicketListProps {
  tickets: GitTicketWithStatus[];
  isLoading: boolean;
  /** Singular noun, e.g. "issue" or "merge request". */
  noun: string;
  emptyTitle: string;
  emptySubtitle: string;
}

export function TicketList({ tickets, isLoading, noun, emptyTitle, emptySubtitle }: TicketListProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');

  const openCount = useMemo(() => tickets.filter((t) => isOpen(t.status)).length, [tickets]);
  const closedCount = tickets.length - openCount;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter === 'open' && !isOpen(t.status)) return false;
      if (statusFilter === 'closed' && isOpen(t.status)) return false;
      if (!q) return true;
      return (
        t.subject.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q) ||
        t.labels.some((l) => l.includes(q))
      );
    });
  }, [tickets, query, statusFilter]);

  const hasActiveFilters = query.trim() !== '' || statusFilter !== 'open';
  const clearFilters = () => {
    setQuery('');
    setStatusFilter('open');
  };

  if (isLoading) return <ListSkeleton />;

  // First load with nothing at all: show the empty state, skip the toolbar.
  if (tickets.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 px-8 text-center">
          <p className="font-medium">{emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{emptySubtitle}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search + status filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${noun}s…`}
            className="h-9 pl-8"
            aria-label={`Search ${noun}s`}
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          {(['open', 'closed', 'all'] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={statusFilter === value ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs capitalize"
              onClick={() => setStatusFilter(value)}
              aria-pressed={statusFilter === value}
            >
              {value === 'open' && <CircleDot className="size-3.5 text-chart-5" aria-hidden="true" />}
              {value === 'closed' && <CheckCircle2 className="size-3.5" aria-hidden="true" />}
              {value}
              {value === 'open' && ` ${openCount}`}
              {value === 'closed' && ` ${closedCount}`}
            </Button>
          ))}
        </div>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1 text-xs text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="size-3.5" aria-hidden="true" /> Clear
          </Button>
        )}
      </div>

      <Card className="overflow-hidden py-0">
        {filtered.length === 0 ? (
          <div className="px-8 py-12 text-center text-sm text-muted-foreground">
            No {noun}s match your filters.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((ticket) => (
              <TicketRow key={ticket.event.id} ticket={ticket} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default TicketList;
