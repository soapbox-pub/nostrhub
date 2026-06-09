import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import type { RankedNip } from '@/hooks/useRankedNips';
import { UserAvatar } from '@/components/UserAvatar';
import { nipHref } from '@/lib/nips';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function NipCard({ nip }: { nip: RankedNip }) {
  const href = nipHref(nip);

  return (
    <Card className="group h-full transition-colors hover:border-primary/50">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex-1 space-y-1.5">
          {nip.number && (
            <span className="font-mono text-sm font-semibold text-primary">NIP-{nip.number}</span>
          )}
          <Link
            to={href}
            className="block font-semibold leading-snug tracking-tight hover:text-primary focus-visible:underline focus-visible:outline-none"
          >
            {nip.title}
          </Link>
          {nip.deprecated && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Deprecated
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <GraduationCap className="size-3.5 text-primary" />
            {nip.expertCount} expert{nip.expertCount === 1 ? '' : 's'}
          </span>
          {nip.custom && (
            <span className="inline-flex items-center gap-1.5">
              by <UserAvatar pubkey={nip.custom.author} size="sm" />
            </span>
          )}
          {nip.kinds && nip.kinds.length > 0 && (
            <span className="font-mono">
              kind{nip.kinds.length === 1 ? '' : 's'} {nip.kinds.slice(0, 4).join(', ')}
              {nip.kinds.length > 4 ? '…' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default NipCard;
