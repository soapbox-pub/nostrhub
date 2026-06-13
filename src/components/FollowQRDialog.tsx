import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { generateQR } from '@/lib/qrCode';

interface FollowQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hex pubkey, used for the avatar. */
  pubkey: string;
  /** Bech32 npub used to build the follow link. */
  npub: string;
  displayName: string;
}

/** A QR code that, when scanned, opens a Ditto follow link for the profile. */
export function FollowQRDialog({
  open,
  onOpenChange,
  pubkey,
  npub,
  displayName,
}: FollowQRDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const followUrl = npub ? `https://ditto.pub/${npub}` : '';

  useEffect(() => {
    if (!followUrl || !open) return;
    let active = true;
    generateQR(followUrl)
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        /* QR generation failed — leave the placeholder. */
      });
    return () => {
      active = false;
    };
  }, [followUrl, open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(followUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — fail quietly.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-[400px] flex-col items-center gap-5 rounded-2xl p-6">
        <DialogTitle className="sr-only">Profile QR code</DialogTitle>

        <div className="flex flex-col items-center gap-2">
          <UserAvatar pubkey={pubkey} size="lg" className="size-16 ring-2 ring-primary/30" />
          <p className="text-center text-sm text-muted-foreground">
            Scan to view{' '}
            <span className="font-medium text-foreground">{displayName}</span>
          </p>
        </div>

        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR code linking to ${displayName}'s profile`}
            className="w-full rounded-xl border border-border"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="aspect-square w-full animate-pulse rounded-xl border border-border bg-muted" />
        )}

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 shrink-0 text-chart-5" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="max-w-64 truncate">{followUrl}</span>
        </button>
      </DialogContent>
    </Dialog>
  );
}

export default FollowQRDialog;
