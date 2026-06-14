import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Check } from 'lucide-react';
import { useNipApprovals, nipTargetKey, type NipTarget } from '@/hooks/useNipApprovals';
import { UserAvatar } from '@/components/UserAvatar';
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const MAX_STACK = 4;

/**
 * Avatar stack of the experts who approved a NIP, styled to match `NipCard`.
 * Each avatar links to its expert's profile; the trailing badge shows a check
 * (all experts fit) or a `+N` overflow count.
 */
export function ExpertApprovers({
  target,
  className,
}: {
  target: NipTarget;
  className?: string;
}) {
  const targets = useMemo(() => [target], [target]);
  const approvalsQuery = useNipApprovals(targets);
  const experts = approvalsQuery.data?.[nipTargetKey(target)]?.experts ?? [];

  if (experts.length === 0) return null;

  const shown = experts.slice(0, MAX_STACK);
  const extra = experts.length - shown.length;

  return (
    <AvatarGroup
      className={cn(className)}
      aria-label={`${experts.length} expert${experts.length === 1 ? '' : 's'} approved`}
    >
      {shown.map((pubkey) => (
        <Link key={pubkey} to={`/${nip19.npubEncode(pubkey)}`} className="rounded-full">
          <UserAvatar pubkey={pubkey} size="sm" />
        </Link>
      ))}
      {extra > 0 ? (
        <AvatarGroupCount className="size-6 text-xs">+{extra}</AvatarGroupCount>
      ) : (
        <AvatarGroupCount className="size-6 bg-primary text-primary-foreground">
          <Check className="size-3" strokeWidth={3} />
        </AvatarGroupCount>
      )}
    </AvatarGroup>
  );
}

export default ExpertApprovers;
