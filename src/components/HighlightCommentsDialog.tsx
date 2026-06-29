import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import type { ParsedHighlight } from '@/lib/highlightSource';
import { UserAvatar } from '@/components/UserAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function HighlightComment({ highlight }: { highlight: ParsedHighlight }) {
  const { event, comment } = highlight;
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || shortNpub(event.pubkey);
  const npub = nip19.npubEncode(event.pubkey);
  const when = formatDistanceToNow(new Date(event.created_at * 1000), { addSuffix: true });

  return (
    <li className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Link to={`/${npub}`} className="flex items-center gap-2 hover:text-primary">
          <UserAvatar pubkey={event.pubkey} size="sm" />
          <span className="text-sm font-semibold text-foreground">{name}</span>
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <time className="text-xs text-muted-foreground" dateTime={new Date(event.created_at * 1000).toISOString()}>
          {when}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {comment}
      </p>
    </li>
  );
}

interface HighlightCommentsDialogProps {
  highlights: ParsedHighlight[] | null;
  onClose: () => void;
}

/** Reveals the comment(s) attached to a clicked highlight span. */
export function HighlightCommentsDialog({ highlights, onClose }: HighlightCommentsDialogProps) {
  const open = !!highlights && highlights.length > 0;
  const excerpt = highlights?.[0]?.text;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {highlights && highlights.length > 1
              ? `${highlights.length} highlights`
              : 'Highlight'}
          </DialogTitle>
        </DialogHeader>

        {excerpt && (
          <blockquote className="max-h-32 overflow-y-auto rounded-r-lg border-l-4 border-primary/60 bg-primary/5 px-4 py-3 text-sm italic leading-relaxed text-muted-foreground">
            “{excerpt}”
          </blockquote>
        )}

        <ScrollArea className="max-h-[50vh] pr-3">
          <ul className="space-y-3">
            {highlights?.map((h) => (
              <HighlightComment key={h.event.id} highlight={h} />
            ))}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
