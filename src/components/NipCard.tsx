import { Link } from 'react-router-dom';
import { Check, MessageSquareDashed } from 'lucide-react';
import type { RankedNip } from '@/hooks/useRankedNips';
import { useAuthor } from '@/hooks/useAuthor';
import { useOfficialNip } from '@/hooks/useOfficialNips';
import { useBud } from '@/hooks/useBuds';
import { UserAvatar } from '@/components/UserAvatar';
import { nipHref } from '@/lib/nips';
import { shortNpub } from '@/lib/nostr';
import { markdownPreview } from '@/lib/markdownPreview';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';

const MAX_STACK = 4;

export function NipCard({ nip }: { nip: RankedNip }) {
  const href = nipHref(nip);
  const author = useAuthor(nip.custom?.author ?? '');
  const authorMeta = author.data?.metadata;
  const authorName = nip.custom
    ? authorMeta?.name || authorMeta?.display_name || shortNpub(nip.custom.author)
    : undefined;

  const isBud = nip.target.type === 'bud';
  const isOfficial = nip.target.type === 'official';

  // Custom NIPs carry their body inline; official NIPs and BUDs need a lazy fetch.
  const officialNip = useOfficialNip(isOfficial ? nip.number : undefined);
  const bud = useBud(isBud ? nip.number : undefined);
  const rawContent =
    nip.custom?.content ?? officialNip.data?.content ?? bud.data?.content ?? '';
  const preview = markdownPreview(rawContent);

  const approvers = nip.expertApprovers;
  const shown = approvers.slice(0, MAX_STACK);
  const extra = approvers.length - shown.length;

  const codeLabel = isBud ? `BUD-${nip.number}` : nip.number ? `NIP-${nip.number}` : undefined;

  return (
    <Card className="group relative h-full overflow-clip border-border/70 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
      {/* Nebula sheen that fades in on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary/20 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />
      <Link
        to={href}
        className="relative block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="flex h-full flex-col gap-3 px-4">
          <div className="flex-1 space-y-1.5">
            {codeLabel && (
              <span className="font-mono text-sm font-semibold text-primary transition-[text-shadow] duration-300 group-hover:[text-shadow:0_0_12px_hsl(0_80%_62%/0.7)]">
                {codeLabel}
              </span>
            )}
            <h3 className="font-semibold leading-snug tracking-tight group-hover:text-primary">
              {nip.title}
            </h3>
            {nip.deprecated && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Deprecated
              </Badge>
            )}
            {nip.custom?.status === 'review' && (
              <Badge variant="outline" className="gap-1 border-primary/40 text-xs text-primary">
                <MessageSquareDashed className="size-3" aria-hidden="true" />
                Open for review
              </Badge>
            )}
            {preview && (
              <p className="line-clamp-3 text-sm text-muted-foreground">{preview}</p>
            )}
          </div>

          {(nip.custom || approvers.length > 0) && (
            <div className="flex items-center gap-2 border-t border-border/50 pt-3">
              {nip.custom && (
                <>
                  <UserAvatar pubkey={nip.custom.author} size="sm" />
                  <span className="truncate text-xs text-muted-foreground">by {authorName}</span>
                </>
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
          )}
        </CardContent>
      </Link>
    </Card>
  );
}

export function NipCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-2 px-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  );
}

export default NipCard;
