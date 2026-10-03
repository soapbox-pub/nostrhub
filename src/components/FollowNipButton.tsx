import { Bell, BellOff, BellRing } from 'lucide-react';
import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowedNips } from '@/hooks/useFollowedNips';
import { useToast } from '@/hooks/useToast';
import type { NipTarget } from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Follow a NIP to get notified about its new revisions (community NIPs),
 * comments, and forks. Hidden for logged-out users and signers without NIP-44,
 * since the follow list lives in the encrypted settings event.
 */
export function FollowNipButton({ target, className }: { target: NipTarget; className?: string }) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { isFollowing, setFollowing, isPending } = useFollowedNips();
  const [hovered, setHovered] = useState(false);

  if (!user?.signer.nip44) return null;

  const following = isFollowing(target);

  const handleClick = async () => {
    try {
      await setFollowing(target, !following);
      toast({
        title: following ? 'Unfollowed' : 'Following',
        description: following
          ? undefined
          : "You'll be notified about new revisions, comments, and forks.",
      });
    } catch (error) {
      toast({
        title: 'Failed to update follows',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const Icon = following ? (hovered ? BellOff : BellRing) : Bell;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      disabled={isPending}
      aria-pressed={following}
      className={cn('gap-1.5', className)}
    >
      <Icon className="size-4" aria-hidden="true" />
      {following ? (hovered ? 'Unfollow' : 'Following') : 'Follow'}
    </Button>
  );
}

export default FollowNipButton;
