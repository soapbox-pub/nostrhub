import { Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvent } from '@/hooks/useEvent';
import { GitTicketPage } from './GitTicketPage';
import { NotePage } from './NotePage';
import { CustomNipPage } from './CustomNipPage';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import { resolveEventPath } from '@/lib/eventRouting';
import { GIT_ISSUE_KIND, GIT_PATCH_KIND, GIT_PR_KIND } from '@/lib/git';

const GIT_TICKET_KINDS: number[] = [GIT_ISSUE_KIND, GIT_PR_KIND, GIT_PATCH_KIND];

function EventSkeleton() {
  return (
    <Layout className="max-w-2xl">
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    </Layout>
  );
}

interface EventRouteProps {
  /** The event id (hex). */
  id: string;
  /** Relay hints from the NIP-19 identifier. */
  relays?: string[];
}

/**
 * Resolver for `note1` / `nevent1` identifiers whose kind isn't known up
 * front. Fetches the event, then routes it the way a GitHub user would expect:
 * issues, merge requests, and root patches get their ticket page; statuses,
 * PR updates, and patch replies redirect to their root; comments redirect to
 * their root's page anchored at the comment; everything else renders as a
 * plain note.
 */
export function EventRoute({ id, relays = [] }: EventRouteProps) {
  const { data: event, isLoading } = useEvent(id, relays);

  if (isLoading) {
    return <EventSkeleton />;
  }

  if (!event) {
    return (
      <Layout className="max-w-2xl">
        <Card className="border-dashed">
          <CardContent className="px-8 py-12 text-center">
            <p className="mx-auto max-w-sm text-muted-foreground">
              Event not found. It may not have propagated to your relays yet.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const redirect = resolveEventPath(event, relays);
  if (redirect) {
    return <Navigate to={redirect} replace />;
  }

  if (GIT_TICKET_KINDS.includes(event.kind)) {
    return <GitTicketPage eventId={event.id} />;
  }

  if (event.kind === CUSTOM_NIP_KIND) {
    return <CustomNipPage eventId={event.id} />;
  }

  return <NotePage id={event.id} />;
}

export default EventRoute;
