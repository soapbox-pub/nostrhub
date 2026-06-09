import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { RankedNip } from '@/hooks/useRankedNips';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { nipHref } from '@/lib/nips';
import { shortNpub } from '@/lib/nostr';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';

const MAX_STACK = 4;

export function NipCard({ nip }: { nip: RankedNip }) {
  const href = nipHref(nip);
  const author = useAuthor(nip.custom?.author ?? '');
  const authorMeta = author.data?.metadata;
  const authorName = nip.custom
    ? authorMeta?.name || authorMeta?.display_name || shortNpub(nip.custom.author)
    : undefined;

  const approvers = nip.expertApprovers;
  const shown = approvers.slice(0, MAX_STACK);
  const extra = approvers.length - shown.length;

  return (
    <Card className="group h-full transition-colors hover:border-primary/50">
      <Link
        to={href}
        className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="flex h-full flex-col gap-3 px-4">
          <div className="flex-1 space-y-1.5">
            {nip.number && (
              <span className="font-mono text-sm font-semibold text-primary">NIP-{nip.number}</span>
            )}
            <h3 className="font-semibold leading-snug tracking-tight group-hover:text-primary">
              {nip.title}
            </h3>
            {nip.deprecated && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Deprecated
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {authorName && (
              <span className="truncate text-xs text-muted-foreground">by {authorName}</span>
            )}
            {approvers.length > 0 && (
              <AvatarGroup className="ml-auto">
                {shown.map((pubkey) => (
                  <UserAvatar key={pubkey} pubkey={pubkey} size="sm" />
                ))}
                {extra > 0 ? (
                  <AvatarGroupCount className="size-6 text-xs">+{extra}</AvatarGroupCount>
                ) : (
                  <AvatarGroupCount className="size-6 bg-primary text-primary-foreground">
                    <Check className="size-3" strokeWidth={3} />
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export default NipCard;
