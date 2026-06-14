import { Download } from 'lucide-react';
import { formatAssetSize, isApkAsset, type ZapstoreAsset } from '@/lib/zapstore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Friendly label for a download button derived from an asset's metadata. */
function assetLabel(asset: ZapstoreAsset): string {
  if (isApkAsset(asset)) {
    // Android assets often list multiple architectures on one universal APK.
    const arch = asset.architectures.find((a) => a.startsWith('android'));
    if (asset.architectures.filter((a) => a.startsWith('android')).length > 1) {
      return 'Download APK';
    }
    if (arch) {
      const label = arch.replace(/^android-/, '');
      return `Download APK (${label})`;
    }
    return 'Download APK';
  }
  if (asset.filename) return `Download ${asset.filename}`;
  return 'Download';
}

/** A single download button for a Zapstore asset (kind 3063). */
export function AssetDownloadButton({
  asset,
  variant = 'default',
  className,
}: {
  asset: ZapstoreAsset;
  variant?: 'default' | 'outline';
  className?: string;
}) {
  const url = asset.urls[0];
  if (!url) return null;

  return (
    <Button asChild variant={variant} className={cn('gap-2', className)}>
      <a href={url} target="_blank" rel="noopener noreferrer" download={asset.filename}>
        <Download className="size-4" aria-hidden="true" />
        <span className="truncate">{assetLabel(asset)}</span>
        {asset.size !== undefined && (
          <span className="text-xs font-normal opacity-70">{formatAssetSize(asset.size)}</span>
        )}
      </a>
    </Button>
  );
}
