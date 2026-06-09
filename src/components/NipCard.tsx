import { Link } from 'react-router-dom';
import { GraduationCap, GitFork } from 'lucide-react';
import type { RankedNip } from '@/hooks/useRankedNips';
import { UserAvatar } from '@/components/UserAvatar';
import { nipHref } from '@/lib/nips';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function NipCard({ nip, rank }: { nip: RankedNip; rank?: number }) {
  const href = nipHref(nip);

  return (
    <Card className="group transition-colors hover:border-primary/50">
      <CardContent className="flex items-start gap-4 p-4">
        {typeof rank === 'number' && (
          <div className="mt-0.5 w-6 shrink-0 text-center font-mono text-sm font-semibold text-muted-foreground">
            {rank}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={href}
              className="font-semibold tracking-tight hover:text-primary focus-visible:outline-none focus-visible:underline"
            >
              {nip.number ? (
                <>
                  <span className="font-mono text-primary">NIP-{nip.number}</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  {nip.title}
                </>
              ) : (
                nip.title
              )}
            </Link>
            {!nip.number && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <GitFork className="size-3" /> Community
              </Badge>
            )}
            {nip.deprecated && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Deprecated
              </Badge>
            )}
            {nip.expertAuthored && (
              <Badge variant="default" className="gap-1 text-xs">
                <GraduationCap className="size-3" /> Expert author
              </Badge>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <GraduationCap className="size-3.5 text-primary" />
              {nip.expertCount} expert{nip.expertCount === 1 ? '' : 's'}
            </span>
            {nip.totalCount > nip.expertCount && <span>{nip.totalCount} total approvals</span>}
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
        </div>
      </CardContent>
    </Card>
  );
}

export default NipCard;
