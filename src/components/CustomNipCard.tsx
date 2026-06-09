import { Link } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import type { CustomNip } from '@/lib/nips';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function timeAgo(unix: number): string {
  const diff = Date.now() / 1000 - unix;
  const mins = Math.floor(diff / 60);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(unix * 1000).toLocaleDateString();
}

/** A snippet of the NIP body with markdown headings/markers stripped. */
function snippet(content: string, max = 160): string {
  const text = content
    .replace(/^#.*$/gm, '')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function CustomNipCard({ nip }: { nip: CustomNip }) {
  const author = useAuthor(nip.author);
  const name = author.data?.metadata?.name || author.data?.metadata?.display_name || shortNpub(nip.author);
  const body = snippet(nip.content);

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardContent className="space-y-2 p-4">
        <Link
          to={`/${nip.naddr}`}
          className="font-semibold tracking-tight hover:text-primary focus-visible:outline-none focus-visible:underline"
        >
          {nip.title}
        </Link>

        {body && <p className="line-clamp-2 text-sm text-muted-foreground">{body}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UserAvatar pubkey={nip.author} size="sm" />
            <span className="text-foreground">{name}</span>
          </span>
          <span>{timeAgo(nip.createdAt)}</span>
          {nip.fork && (
            <Badge variant="outline" className="text-[10px]">
              Fork
            </Badge>
          )}
          {nip.kinds.length > 0 && (
            <span className="font-mono">kind {nip.kinds.slice(0, 3).join(', ')}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CustomNipCard;
