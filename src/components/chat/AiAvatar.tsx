import { Bot } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { shortNpub } from '@/lib/nostr';
import { cn } from '@/lib/utils';

interface AiAvatarProps {
  /** The pubkey of the human who actually posted the AI-generated message. */
  authorPubkey: string;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

/**
 * Avatar shown for AI-generated chat messages.
 *
 * The primary avatar is a generic AI bot — the message is presented as if it
 * came from "AI" rather than the signing user. A small avatar of the original
 * human author is tucked into the bottom-right corner to show whose key
 * actually produced (and signed) the message.
 */
export function AiAvatar({ authorPubkey, size = 'default', className }: AiAvatarProps) {
  const author = useAuthor(authorPubkey);
  const metadata = author.data?.metadata;
  const authorName = metadata?.name || metadata?.display_name || shortNpub(authorPubkey);

  return (
    <span className={cn('relative inline-flex', className)}>
      <Avatar
        size={size}
        title="AI assistant"
        className="bg-primary/10 ring-1 ring-primary/40"
      >
        <AvatarFallback className="bg-primary/10 text-primary">
          <Bot className="size-1/2" />
        </AvatarFallback>
      </Avatar>
      {/* Original author's avatar, tucked in the corner. */}
      <Avatar
        size="sm"
        title={`Posted by ${authorName}`}
        className="absolute -bottom-1 -right-1 size-4 ring-2 ring-background"
      >
        <AvatarImage src={metadata?.picture} alt={authorName} />
        <AvatarFallback className="text-[8px]">
          {authorName.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </span>
  );
}

export default AiAvatar;
