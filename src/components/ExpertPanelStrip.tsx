import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';

function PanelChip({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || shortNpub(pubkey);

  const npub = (() => {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return pubkey;
    }
  })();

  return (
    <Link
      to={`/${npub}`}
      className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 py-1 pl-1 pr-3 text-sm font-medium backdrop-blur-sm transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <UserAvatar pubkey={pubkey} size="sm" className="size-7" />
      <span className="max-w-36 truncate">{name}</span>
    </Link>
  );
}

/** A compact, single-row introduction to the rest of the expert panel. */
export function ExpertPanelStrip({ pubkeys }: { pubkeys: string[] }) {
  if (pubkeys.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-nebula">
        The Panel
      </span>
      {pubkeys.map((pubkey) => (
        <PanelChip key={pubkey} pubkey={pubkey} />
      ))}
      <Link
        to="/experts"
        className="ml-1 text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
      >
        Meet the panel →
      </Link>
    </div>
  );
}

export default ExpertPanelStrip;
