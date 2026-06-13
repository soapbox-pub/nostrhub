import { useState } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { GitBranch, Link2, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserAvatar } from '@/components/UserAvatar';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/getDisplayName';
import { shortNpub } from '@/lib/nostr';
import { cn } from '@/lib/utils';
import {
  EDGE_TYPE_LABELS,
  GRAPH_NODE_KIND,
  NODE_STATUS_LABELS,
  NODE_TYPE_LABELS,
  isEntityType,
  tierForDepth,
  type GraphEdge,
  type GraphNode,
  type GraphNodeType,
} from '@/lib/strategyGraph';

interface NodePanelProps {
  node: GraphNode;
  /** All resolved edges in the graph; the panel picks out those touching this node. */
  edges: GraphEdge[];
  nodesByAddress: Map<string, GraphNode>;
  onClose: () => void;
  onSelectNode: (address: string) => void;
  onEdit: (node: GraphNode) => void;
  /** Begin connect mode with this node as the source. */
  onStartConnect: (node: GraphNode) => void;
  /** Open the node dialog pre-parented to this node. */
  onAddSubNode: (parent: GraphNode) => void;
  /** Filter the canvas by a topic. */
  onSelectTopic: (topic: string) => void;
  className?: string;
}

const TYPE_BADGE: Record<GraphNodeType, string> = {
  goal: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
  problem: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  task: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  person: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  org: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  concept: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
  object: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30',
};

/** Passive phrasing for edges pointing *at* the selected node. */
const INCOMING_EDGE_LABELS: Record<GraphEdge['type'], string> = {
  'depends-on': 'depended on by',
  'blocks': 'blocked by',
  'supports': 'supported by',
  'relates': 'relates to',
  'leads': 'led by',
  'funds': 'funded by',
  'works-with': 'works with',
  'advises': 'advised by',
  'builds': 'built by',
};

/** Detail panel for the selected strategy node. */
export function NodePanel({
  node,
  edges,
  nodesByAddress,
  onClose,
  onSelectNode,
  onEdit,
  onStartConnect,
  onAddSubNode,
  onSelectTopic,
  className,
}: NodePanelProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(node.author);
  const { mutateAsync: publish, isPending: isDeleting } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOwn = user?.pubkey === node.author;
  const displayName = getDisplayName(author.data?.metadata, node.author);
  const entity = isEntityType(node.type);

  // Hierarchy neighbours.
  const parents = node.parents
    .map((address) => nodesByAddress.get(address))
    .filter((n): n is GraphNode => Boolean(n));
  const children = Array.from(nodesByAddress.values()).filter((n) => n.parents.includes(node.address));

  const connections = edges
    .filter((e) => e.from === node.address || e.to === node.address)
    .map((edge) => {
      const otherAddress = edge.from === node.address ? edge.to : edge.from;
      const other = nodesByAddress.get(otherAddress);
      const outgoing = edge.from === node.address;
      return other ? { edge, other, outgoing } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const handleDelete = async () => {
    try {
      await publish({
        kind: 5,
        content: '',
        tags: [
          ['a', node.address],
          ['e', node.event.id],
          ['k', GRAPH_NODE_KIND.toString()],
        ],
      });
      queryClient.invalidateQueries({ queryKey: ['strategy-graph'] });
      toast({ title: 'Deletion requested', description: 'Relays that honor NIP-09 will remove the node.' });
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to request deletion',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      <div className="flex items-start gap-3 border-b border-border/60 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={TYPE_BADGE[node.type]}>
              {NODE_TYPE_LABELS[node.type]}
            </Badge>
            {!entity && (
              <Badge variant={node.status === 'done' ? 'default' : 'secondary'}>
                {NODE_STATUS_LABELS[node.status]}
              </Badge>
            )}
            <Badge variant="outline" className="text-muted-foreground">
              {tierForDepth(node.depth)}
            </Badge>
          </div>
          <h2 className="font-display text-lg font-semibold leading-snug">{node.title}</h2>
          {node.type === 'person' && node.subject && (
            <Link
              to={`/${nip19.npubEncode(node.subject)}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <UserAvatar pubkey={node.subject} size="sm" showExpertBadge={false} />
              <span className="truncate">View Nostr profile</span>
            </Link>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserAvatar pubkey={node.author} size="sm" />
            <Link to={`/${nip19.npubEncode(node.author)}`} className="truncate hover:text-foreground">
              {displayName}
            </Link>
            <span aria-hidden="true">·</span>
            <time dateTime={new Date(node.createdAt * 1000).toISOString()}>
              {new Date(node.createdAt * 1000).toLocaleDateString()}
            </time>
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close panel" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border/60 p-4">
        <Button size="sm" variant="outline" onClick={() => onStartConnect(node)}>
          <Link2 className="size-4" />
          Connect
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAddSubNode(node)} disabled={!user}>
          <GitBranch className="size-4" />
          Add sub-node
        </Button>
        {isOwn && (
          <>
            <Button size="sm" variant="outline" onClick={() => onEdit(node)}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-4">
          {node.content ? (
            <MarkdownContent content={node.content} className="text-sm" inlineOnly />
          ) : (
            <p className="text-sm text-muted-foreground italic">No description.</p>
          )}

          {node.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {node.topics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => onSelectTopic(topic)}
                  className="rounded-full border border-border/60 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  #{topic}
                </button>
              ))}
            </div>
          )}

          {node.people.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">People</h3>
              <div className="flex flex-wrap gap-2">
                {node.people.map((hex) => (
                  <Link
                    key={hex}
                    to={`/${nip19.npubEncode(hex)}`}
                    className="flex items-center gap-1.5 rounded-full border border-border/60 py-0.5 pl-0.5 pr-2.5 text-xs transition-colors hover:bg-accent/10"
                  >
                    <UserAvatar pubkey={hex} size="sm" showExpertBadge={false} className="size-5" />
                    <span className="max-w-28 truncate">{shortNpub(hex)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {(parents.length > 0 || children.length > 0) && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Hierarchy</h3>
              <ul className="space-y-1.5">
                {parents.map((p) => (
                  <li key={p.address}>
                    <button
                      type="button"
                      onClick={() => onSelectNode(p.address)}
                      className="w-full rounded-md border border-border/60 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-muted-foreground">parent ·</span>{' '}
                      <span className="font-medium">{p.title}</span>
                    </button>
                  </li>
                ))}
                {children.map((c) => (
                  <li key={c.address}>
                    <button
                      type="button"
                      onClick={() => onSelectNode(c.address)}
                      className="w-full rounded-md border border-border/60 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-muted-foreground">child ·</span>{' '}
                      <span className="font-medium">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Connections</h3>
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not connected yet. Use “Connect” to relate this node to others.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {connections.map(({ edge, other, outgoing }) => (
                  <li key={edge.address}>
                    <button
                      type="button"
                      onClick={() => onSelectNode(other.address)}
                      className="w-full rounded-md border border-border/60 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-muted-foreground">
                        {outgoing ? EDGE_TYPE_LABELS[edge.type] : INCOMING_EDGE_LABELS[edge.type]}
                      </span>{' '}
                      <span className="font-medium">{other.title}</span>
                      {edge.label && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{edge.label}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator />

          <div>
            <h3 className="mb-3 text-sm font-semibold">Discussion</h3>
            <CommentsSection
              root={node.event as NostrEvent}
              emptyStateMessage="No discussion yet"
              emptyStateSubtitle="Start coordinating on this node."
            />
          </div>
        </div>
      </ScrollArea>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this node?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a NIP-09 deletion request for “{node.title}”. Connections
              other people made to it will disappear from the graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
