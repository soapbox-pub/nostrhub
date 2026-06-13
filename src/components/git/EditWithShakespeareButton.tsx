import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { shakespeareEditUrl, type GitRepoAnnouncement } from '@/lib/git';

interface EditWithShakespeareButtonProps {
  repo: GitRepoAnnouncement;
  /** Visual treatment. `hero` matches detail-page actions; `chip` is a compact pill for cards. */
  variant?: 'hero' | 'chip';
  className?: string;
}

/**
 * "Edit with Shakespeare" link — opens the repo's `nostr://` clone URI in
 * Shakespeare. Only meaningful for repos tagged `t=shakespeare`; callers gate
 * with `isShakespeareRepo`.
 */
export function EditWithShakespeareButton({
  repo,
  variant = 'hero',
  className,
}: EditWithShakespeareButtonProps) {
  const href = shakespeareEditUrl(repo.pubkey, repo.identifier);

  if (variant === 'chip') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Wand2 className="size-3" aria-hidden="true" />
        Edit with Shakespeare
      </a>
    );
  }

  return (
    <Button size="sm" asChild className={cn('gap-1.5', className)}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <Wand2 className="size-4" aria-hidden="true" />
        Edit with Shakespeare
      </a>
    </Button>
  );
}
