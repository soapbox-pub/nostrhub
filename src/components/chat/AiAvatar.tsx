import { Bot } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface AiAvatarProps {
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

/**
 * Avatar shown for AI-generated chat messages.
 *
 * A generic AI bot — the message is presented as if it came from "AI" rather
 * than the signing user.
 */
export function AiAvatar({ size = 'default', className }: AiAvatarProps) {
  return (
    <Avatar
      size={size}
      title="AI assistant"
      className={cn('bg-primary/10 ring-1 ring-primary/40', className)}
    >
      <AvatarFallback className="bg-primary/10 text-primary">
        <Bot className="size-1/2" />
      </AvatarFallback>
    </Avatar>
  );
}

export default AiAvatar;
