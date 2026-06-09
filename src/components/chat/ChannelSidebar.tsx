import { Link } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { CHAT_CHANNELS } from '@/lib/chat';
import { cn } from '@/lib/utils';

interface ChannelSidebarProps {
  activeTopic: string;
  /** Called after navigating — used to close the mobile drawer. */
  onNavigate?: () => void;
}

export function ChannelSidebar({ activeTopic, onNavigate }: ChannelSidebarProps) {
  return (
    <nav aria-label="Channels" className="flex h-full flex-col">
      <div className="px-2 pb-2 pt-4">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Channels
        </p>
        <ul className="space-y-0.5">
          {CHAT_CHANNELS.map((channel) => {
            const isActive = channel.topic === activeTopic;
            return (
              <li key={channel.topic}>
                <Link
                  to={`/chat/${channel.topic}`}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-primary/10 font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Hash className="size-4 shrink-0 opacity-70" />
                  <span className="truncate">{channel.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

export default ChannelSidebar;
