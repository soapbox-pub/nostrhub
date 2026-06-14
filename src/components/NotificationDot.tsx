import { cn } from '@/lib/utils';

interface NotificationDotProps {
  /** Whether to render the dot. */
  show: boolean;
  /** Additional positioning classes (e.g. `top-0 right-0`). */
  className?: string;
}

/**
 * A small unread-notification indicator dot.
 *
 * Render as an absolutely-positioned sibling of an avatar inside a `relative`
 * container. Do NOT place inside the `<Avatar>` primitive — it is
 * `overflow-hidden` and would clip the dot.
 */
export function NotificationDot({ show, className }: NotificationDotProps) {
  if (!show) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-0.5 right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background animate-dot-pulse',
        className,
      )}
    />
  );
}

export default NotificationDot;
