import { useMemo } from 'react';
import { GraduationCap } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { useExperts } from '@/hooks/useExperts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { shortNpub } from '@/lib/nostr';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  pubkey: string;
  size?: 'sm' | 'default' | 'lg';
  /** Show the graduation-cap marker above the avatar when this user is an expert. */
  showExpertBadge?: boolean;
  className?: string;
}

export function UserAvatar({ pubkey, size = 'default', showExpertBadge = true, className }: UserAvatarProps) {
  const author = useAuthor(pubkey);
  const { isExpert } = useExperts();
  const metadata = author.data?.metadata;

  const displayName = metadata?.name || metadata?.display_name || shortNpub(pubkey);
  const expert = showExpertBadge && isExpert(pubkey);

  const initials = useMemo(
    () => displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'N',
    [displayName],
  );

  return (
    <span className={cn('relative inline-flex shrink-0', expert && 'pt-2', className)}>
      {expert && (
        <span
          className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 text-primary"
          title="Nostr Expert"
          aria-label="Nostr Expert"
        >
          <GraduationCap className="size-3.5 drop-shadow-sm" strokeWidth={2.5} />
        </span>
      )}
      <Avatar size={size} className={cn(expert && 'ring-2 ring-primary/60')}>
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
    </span>
  );
}

export default UserAvatar;
