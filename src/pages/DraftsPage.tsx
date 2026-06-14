import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, FileText, Trash2, PenLine } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDrafts } from '@/hooks/useDrafts';
import { draftKindLabel, draftResumeHref, type Draft } from '@/lib/drafts';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/useToast';

function formatWhen(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function DraftRow({ draft, onDelete }: { draft: Draft; onDelete: (d: Draft) => void }) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="shrink-0">
              {draftKindLabel(draft.kind)}
            </Badge>
            <h3 className="truncate font-medium">{draft.title}</h3>
          </div>
          <p className="text-sm text-muted-foreground">Last saved {formatWhen(draft.updatedAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link to={draftResumeHref(draft)}>
              <PenLine className="size-4" />
              Continue
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(draft)}
            aria-label={`Delete draft ${draft.title}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const DraftsPage = () => {
  const { user } = useCurrentUser();
  const { drafts, deleteDraft, hasNip44Support } = useDrafts();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<Draft | null>(null);

  useSeoMeta({
    title: 'Your drafts | NostrHub',
    description: 'Pick up where you left off on your saved NIP and article drafts.',
  });

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const draft = pendingDelete;
    setPendingDelete(null);
    deleteDraft.mutate(
      { slug: draft.slug },
      {
        onSuccess: () => toast({ title: 'Draft deleted' }),
        onError: (err) =>
          toast({ title: 'Failed to delete draft', description: err.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to="/">
          <ArrowLeft className="mr-1.5 size-4" /> Back
        </Link>
      </Button>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Your drafts</h1>
          <p className="text-sm text-muted-foreground">
            Private, encrypted drafts that sync across your devices.
          </p>
        </div>
      </div>

      {!user ? (
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>Log in to view your saved drafts.</AlertDescription>
          </Alert>
          <LoginArea className="max-w-60" />
        </div>
      ) : !hasNip44Support ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Your signer doesn't support NIP-44 encryption, which drafts require. Try logging in with a
            browser extension or remote signer that supports it.
          </AlertDescription>
        </Alert>
      ) : drafts.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-9 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (drafts.data?.length ?? 0) === 0 ? (
        <Card className="border-dashed">
          <CardContent className="px-8 py-12 text-center">
            <p className="mx-auto max-w-sm text-muted-foreground">
              No drafts yet. Start a{' '}
              <Link to="/create" className="text-primary hover:underline">
                NIP
              </Link>{' '}
              or an{' '}
              <Link to="/articles/create" className="text-primary hover:underline">
                article
              </Link>{' '}
              and hit “Save draft” to come back to it later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.data!.map((draft) => (
            <DraftRow key={draft.slug} draft={draft} onDelete={setPendingDelete} />
          ))}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” will be permanently deleted. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default DraftsPage;
