import { useMemo, useState } from 'react';
import { GraduationCap, Check, X } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useNipApprovals,
  useApproveNip,
  useUnapproveNip,
  nipTargetKey,
  type NipTarget,
} from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface ApproveButtonProps {
  target: NipTarget;
  className?: string;
}

/** Apply, display, or remove the `nostrhub.approve` label for a NIP. */
export function ApproveButton({ target, className }: ApproveButtonProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const targets = useMemo(() => [target], [target]);
  const approvalsQuery = useNipApprovals(targets);
  const { mutate: approve, isPending: isApproving } = useApproveNip();
  const { mutate: unapprove, isPending: isUnapproving } = useUnapproveNip();
  const [hovered, setHovered] = useState(false);

  const data = approvalsQuery.data?.[nipTargetKey(target)];
  const alreadyApproved = user ? data?.all.includes(user.pubkey) ?? false : false;
  const ownEventIds = user ? data?.eventIdsByAuthor[user.pubkey] ?? [] : [];
  const isPending = isApproving || isUnapproving;

  const handleClick = () => {
    if (!user) {
      toast({ title: 'Log in to approve', variant: 'destructive' });
      return;
    }
    if (isPending) return;

    if (alreadyApproved) {
      unapprove(
        { eventIds: ownEventIds },
        {
          onSuccess: () => toast({ title: 'Approval removed' }),
          onError: (e) =>
            toast({ title: 'Failed to remove approval', description: e.message, variant: 'destructive' }),
        },
      );
      return;
    }

    approve(target, {
      onSuccess: () => toast({ title: 'Approval published' }),
      onError: (e) => toast({ title: 'Failed to approve', description: e.message, variant: 'destructive' }),
    });
  };

  const label = (() => {
    if (alreadyApproved) {
      if (isUnapproving) return 'Removing…';
      return hovered ? 'Unapprove' : 'Approved';
    }
    return isApproving ? 'Approving…' : 'Approve';
  })();

  const icon = (() => {
    if (!alreadyApproved) return <GraduationCap className="size-4" />;
    return hovered ? <X className="size-4" /> : <Check className="size-4" />;
  })();

  return (
    <Button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      disabled={isPending}
      variant={alreadyApproved ? (hovered ? 'destructive' : 'secondary') : 'default'}
      className={cn('gap-1.5', className)}
      aria-label={alreadyApproved ? 'Remove your approval' : 'Approve this NIP'}
    >
      {icon}
      {label}
    </Button>
  );
}

export default ApproveButton;
