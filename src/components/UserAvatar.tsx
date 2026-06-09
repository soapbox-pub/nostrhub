import { useMemo } from 'react';
import { useAuthor } from '@/hooks/useAuthor';
import { useExperts } from '@/hooks/useExperts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { shortNpub } from '@/lib/nostr';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  pubkey: string;
  size?: 'sm' | 'default' | 'lg';
  /** Mask the avatar into a shield shape when this user is an expert. */
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
    <Avatar
      size={size}
      title={expert ? 'Nostr Expert' : undefined}
      className={cn(expert && 'avatar-shield', className)}
    >
      <AvatarImage src={metadata?.picture} alt={displayName} />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

export default UserAvatar;
