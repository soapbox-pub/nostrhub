import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { GIT_ISSUE_KIND, GIT_REPO_KIND, type GitRepoAnnouncement } from '@/lib/git';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Opens a dialog to file a NIP-34 issue (kind 1621) against a repository.
 * The issue is tagged with the repo's `a` coordinate and the owner's `p`,
 * and published to the user's write relays plus the repo's announced relays.
 */
export function NewIssueButton({ repo }: { repo: GitRepoAnnouncement }) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    try {
      await publish({
        kind: GIT_ISSUE_KIND,
        content: body.trim(),
        tags: [
          ['a', `${GIT_REPO_KIND}:${repo.pubkey}:${repo.identifier}`],
          ['p', repo.pubkey],
          ['subject', subject.trim()],
        ],
      });
      toast({ title: 'Issue opened' });
      setSubject('');
      setBody('');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['git-tickets', repo.pubkey, repo.identifier] });
    } catch (error) {
      toast({
        title: 'Failed to open issue',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" /> New issue
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in to open an issue</DialogTitle>
            <DialogDescription>
              Issues are signed Nostr events, so you'll need to be logged in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-2">
            <LoginArea />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" /> New issue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Open an issue</DialogTitle>
            <DialogDescription>
              File a bug report, feature request, or question for {repo.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Title"
              maxLength={200}
              autoFocus
              disabled={isPending}
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Leave a description (Markdown supported)…"
              className="min-h-40 resize-none"
              disabled={isPending}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!subject.trim() || !body.trim() || isPending}>
              {isPending ? 'Submitting…' : 'Submit issue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default NewIssueButton;
