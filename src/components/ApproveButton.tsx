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
  const expertCount = data?.expertCount ?? 0;
  const totalCount = data?.totalCount ?? 0;
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
    <div className={cn('flex items-center gap-3', className)}>
      <Button
        onClick={handleApprove}
        disabled={isPending || alreadyApproved}
        variant={alreadyApproved ? 'secondary' : 'default'}
        className="gap-1.5"
      >
        {alreadyApproved ? <Check className="size-4" /> : <GraduationCap className="size-4" />}
        {alreadyApproved ? 'Approved' : isPending ? 'Approving…' : 'Approve'}
      </Button>
      <div className="text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <GraduationCap className="size-3.5 text-primary" />
          {expertCount} expert{expertCount === 1 ? '' : 's'}
        </span>
        {totalCount > expertCount && <span className="ml-2">· {totalCount} total</span>}
      </div>
    </div>
  );
}

export default ApproveButton;
