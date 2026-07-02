import {
  Globe,
  Hash,
  Mail,
  Server,
  Shield,
  Zap,
  X,
} from 'lucide-react';

import { useRelayInfo, type RelayInfoDocument } from '@/hooks/useRelayInfo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface RelayInfoCardProps {
  /** Relay websocket URL (`wss://…`). */
  url: string;
  /** Optional remove handler — renders a delete button when provided. */
  onRemove?: () => void;
  /** Extra content rendered inside the card, below the NIP-11 details. */
  children?: React.ReactNode;
  className?: string;
}

/** Derive a display hostname from a relay URL. */
function hostnameOf(url: string): string {
  return url.replace(/^wss?:\/\//, '').replace(/\/$/, '');
}

/**
 * A card displaying a relay's NIP-11 information (name, description, supported
 * NIPs, fees, limitations). Adapted from Ditto's RelayInfoPanel.
 */
export function RelayInfoCard({ url, onRemove, children, className }: RelayInfoCardProps) {
  const { data: info, isLoading, isError } = useRelayInfo(url);
  const hostname = hostnameOf(url);

  return (
    <div
      className={cn(
        'rounded-lg border border-primary/15 bg-card/60 p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {info?.icon ? (
          <img
            src={info.icon}
            alt=""
            className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Server className="size-4" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{info?.name || hostname}</p>
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">{hostname}</p>
        </div>

        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`Remove ${hostname}`}
            className="-mr-1 -mt-1 size-8 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      ) : info ? (
        <RelayInfoDetails info={info} />
      ) : isError ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="size-3.5" />
          Could not load relay information.
        </p>
      ) : null}

      {children}
    </div>
  );
}

function RelayInfoDetails({ info }: { info: RelayInfoDocument }) {
  const hasBadges =
    info.limitation?.payment_required ||
    info.limitation?.auth_required ||
    info.limitation?.restricted_writes ||
    info.software ||
    info.contact;

  return (
    <div className="mt-3 space-y-3">
      {info.description && (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {info.description}
        </p>
      )}

      {hasBadges && (
        <div className="flex flex-wrap gap-1.5">
          {info.limitation?.payment_required && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Zap className="size-3" /> Paid
            </Badge>
          )}
          {info.limitation?.auth_required && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Shield className="size-3" /> Auth required
            </Badge>
          )}
          {info.limitation?.restricted_writes && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Shield className="size-3" /> Restricted writes
            </Badge>
          )}
          {info.software && (
            <Badge variant="outline" className="max-w-full gap-1 text-xs">
              <Server className="size-3 shrink-0" />
              <span className="min-w-0 truncate">
                {info.software.replace(/^https?:\/\//, '')}
                {info.version ? ` ${info.version}` : ''}
              </span>
            </Badge>
          )}
          {info.contact && (
            <Badge variant="outline" className="max-w-full gap-1 text-xs">
              <Mail className="size-3 shrink-0" />
              <span className="min-w-0 truncate">{info.contact}</span>
            </Badge>
          )}
        </div>
      )}

      {info.supported_nips && info.supported_nips.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Hash className="size-3" />
            Supported NIPs
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...info.supported_nips]
              .sort((a, b) => a - b)
              .map((nip) => (
                <a
                  key={nip}
                  href={`https://github.com/nostr-protocol/nips/blob/master/${String(nip).padStart(2, '0')}.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  {nip}
                </a>
              ))}
          </div>
        </div>
      )}

      {info.fees && (info.fees.admission?.length || info.fees.subscription?.length) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Zap className="size-3" />
            Fees
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {info.fees.admission?.map((fee, i) => (
              <span key={`admission-${i}`} className="rounded-md bg-muted px-2 py-0.5">
                Admission: {fee.amount / 1000} sats
              </span>
            ))}
            {info.fees.subscription?.map((fee, i) => (
              <span key={`sub-${i}`} className="rounded-md bg-muted px-2 py-0.5">
                Subscription: {fee.amount / 1000} sats
                {fee.period ? ` / ${Math.round(fee.period / 86400)}d` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default RelayInfoCard;
