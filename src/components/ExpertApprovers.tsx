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
  const data = approvalsQuery.data?.[nipTargetKey(target)];
  const experts = data?.experts ?? [];

  if (experts.length === 0) return null;

  // Experts approving the current revision first; earlier-revision ones dimmed.
  const stale = new Set(data?.staleAuthors ?? []);
  const ordered = [...experts].sort((a, b) => Number(stale.has(a)) - Number(stale.has(b)));
  const staleCount = experts.filter((pk) => stale.has(pk)).length;
  const currentCount = experts.length - staleCount;

  const shown = ordered.slice(0, MAX_STACK);
  const extra = ordered.length - shown.length;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AvatarGroup
        aria-label={`${experts.length} expert${experts.length === 1 ? '' : 's'} approved${
          staleCount > 0 ? `, ${staleCount} of them an earlier revision` : ''
        }`}
      >
        {shown.map((pubkey) => (
          <Link
            key={pubkey}
            to={`/${nip19.npubEncode(pubkey)}`}
            className={cn('rounded-full', stale.has(pubkey) && 'opacity-50 grayscale')}
            title={stale.has(pubkey) ? 'Approved an earlier revision' : undefined}
          >
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
      {staleCount > 0 && (
        <span className="text-xs text-muted-foreground">
          {currentCount === 0
            ? 'Approved an earlier revision'
            : `${staleCount} approved an earlier revision`}
        </span>
      )}
    </div>
  );
}

export default ExpertApprovers;
