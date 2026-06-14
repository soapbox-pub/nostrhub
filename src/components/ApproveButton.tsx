import { useMemo } from 'react';
import { GraduationCap, Check } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNipApprovals, useApproveNip, nipTargetKey, type NipTarget } from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface ApproveButtonProps {
  target: NipTarget;
  className?: string;
}

/** Apply or display the `nostrhub.approve` label for a NIP. */
export function ApproveButton({ target, className }: ApproveButtonProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const targets = useMemo(() => [target], [target]);
  const approvalsQuery = useNipApprovals(targets);
  const { mutate: approve, isPending } = useApproveNip();

  const data = approvalsQuery.data?.[nipTargetKey(target)];
  const alreadyApproved = user ? data?.all.includes(user.pubkey) ?? false : false;

  const handleApprove = () => {
    if (!user) {
      toast({ title: 'Log in to approve', variant: 'destructive' });
      return;
    }
    if (alreadyApproved) return;
    approve(target, {
      onSuccess: () => toast({ title: 'Approval published' }),
      onError: (e) => toast({ title: 'Failed to approve', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <Button
      onClick={handleApprove}
      disabled={isPending || alreadyApproved}
      variant={alreadyApproved ? 'secondary' : 'default'}
      className={cn('gap-1.5', className)}
    >
      {alreadyApproved ? <Check className="size-4" /> : <GraduationCap className="size-4" />}
      {alreadyApproved ? 'Approved' : isPending ? 'Approving…' : 'Approve'}
    </Button>
  );
}

export default ApproveButton;
