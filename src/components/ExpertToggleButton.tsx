import { GraduationCap } from 'lucide-react';
import { useExperts } from '@/hooks/useExperts';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface ExpertToggleButtonProps {
  pubkey: string;
  /** Render as a compact icon-only button. */
  iconOnly?: boolean;
  className?: string;
  /** Override the icon size/classes (e.g. to match larger sibling buttons). */
  iconClassName?: string;
}

/**
 * Inline control to add/remove a pubkey from the user's Nostr Experts list,
 * usable anywhere an author is displayed.
 */
export function ExpertToggleButton({
  pubkey,
  iconOnly = false,
  className,
  iconClassName,
}: ExpertToggleButtonProps) {
  const { isExpert, toggleExpert } = useExperts();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  // Don't offer to mark yourself as an expert.
  if (user?.pubkey === pubkey) return null;

  const expert = isExpert(pubkey);

  const handleClick = () => {
    toggleExpert(pubkey);
    toast({
      title: expert ? 'Removed from experts' : 'Added to experts',
      description: expert
        ? 'This user will no longer count toward NIP curation.'
        : 'This user now counts toward NIP curation and the community.',
    });
  };

  return (
    <Button
      type="button"
      variant={expert ? 'secondary' : 'outline'}
      size={iconOnly ? 'icon' : 'sm'}
      onClick={handleClick}
      aria-pressed={expert}
      title={expert ? 'Remove from experts' : 'Add to experts'}
      className={cn(iconOnly && 'size-8', className)}
    >
      <GraduationCap className={cn('size-4', expert && 'text-primary', iconClassName)} />
      {!iconOnly && <span>{expert ? 'Expert' : 'Make Expert'}</span>}
    </Button>
  );
}

export default ExpertToggleButton;
