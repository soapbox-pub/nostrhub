import { Link } from 'react-router-dom';
import { BadgeCheck, X } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface ExpertCardProps {
  pubkey: string;
  /** Show a remove button and invoke this when clicked. */
  onRemove?: () => void;
}

/** A profile card for a single Nostr expert. */
export function ExpertCard({ pubkey, onRemove }: ExpertCardProps) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;

  const npub = (() => {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return pubkey;
    }
  })();

  const displayName = metadata?.display_name || metadata?.name || shortNpub(pubkey);
  const handle = metadata?.nip05;
  const about = metadata?.about;

  return (
    <Card className="group relative h-full overflow-hidden border-border/70 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
      {/* Nebula sheen that fades in on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary/20 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${displayName}`}
          className="absolute right-2 top-2 z-10 size-7 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      )}
      <Link
        to={`/${npub}`}
        className="relative block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="flex h-full flex-col items-center gap-3 px-5 text-center">
          <UserAvatar pubkey={pubkey} size="lg" className="size-16" />

          <div className="min-w-0 space-y-1">
            <h3 className="flex items-center justify-center gap-1.5 font-semibold leading-snug tracking-tight group-hover:text-primary">
              <span className="truncate">{displayName}</span>
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified expert" />
            </h3>
            {author.isLoading && !metadata ? (
              <Skeleton className="mx-auto h-3 w-28" />
            ) : (
              handle && (
                <p className="truncate text-xs text-muted-foreground">{handle}</p>
              )
            )}
          </div>

          {about && (
            <p className="line-clamp-3 w-full break-words text-sm text-muted-foreground">
              {about}
            </p>
          )}
        </CardContent>
      </Link>
    </Card>
  );
}

export default ExpertCard;
