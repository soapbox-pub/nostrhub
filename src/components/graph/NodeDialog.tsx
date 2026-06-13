import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserAvatar } from '@/components/UserAvatar';
import { useToast } from '@/hooks/useToast';
import { useSaveGraphNode } from '@/hooks/useSaveGraphNode';
import { slugify } from '@/lib/nips';
import { shortNpub } from '@/lib/nostr';
import {
  WORK_ITEM_TYPES,
  ENTITY_TYPES,
  NODE_STATUSES,
  NODE_TYPE_LABELS,
  NODE_STATUS_LABELS,
  descendantsOf,
  isEntityType,
  type GraphNode,
  type GraphNodeType,
  type GraphNodeStatus,
  type HierarchyLink,
} from '@/lib/strategyGraph';

interface NodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this node instead of creating a new one. */
  node?: GraphNode | null;
  /** All nodes, for the parent picker. */
  allNodes: GraphNode[];
  /** Hierarchy links, to exclude descendants from the parent picker (no cycles). */
  hierarchy: HierarchyLink[];
  /** Pre-selected parent address (used by "Add sub-node"). */
  initialParent?: string | null;
}

const TYPE_HINTS: Record<GraphNodeType, string> = {
  goal: 'An outcome the community wants to reach.',
  problem: 'Something holding the ecosystem back.',
  task: 'A concrete, actionable unit of work.',
  person: 'A real person in the ecosystem. Link their Nostr identity below.',
  org: 'A company, project, working group, or funder.',
};

/** Decode an npub or accept raw 64-char hex; returns hex pubkey or null. */
function toHexPubkey(input: string): string | null {
  const value = input.trim();
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // fall through
  }
  return null;
}

/** Create or edit a strategy-graph node. */
export function NodeDialog({
  open,
  onOpenChange,
  node,
  allNodes,
  hierarchy,
  initialParent,
}: NodeDialogProps) {
  const { toast } = useToast();
  const { mutateAsync: saveNode, isPending } = useSaveGraphNode();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<GraphNodeType>('task');
  const [status, setStatus] = useState<GraphNodeStatus>('open');
  const [content, setContent] = useState('');
  const [subjectInput, setSubjectInput] = useState('');
  const [parents, setParents] = useState<string[]>([]);
  const [topicsInput, setTopicsInput] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [personInput, setPersonInput] = useState('');

  // Sync form state whenever the dialog opens (render-phase adjustment).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTitle(node?.title ?? '');
      setType(node?.type ?? 'task');
      setStatus(node?.status ?? 'open');
      setContent(node?.content ?? '');
      setSubjectInput(node?.subject ? nip19.npubEncode(node.subject) : '');
      setParents(node?.parents ?? (initialParent ? [initialParent] : []));
      setTopicsInput((node?.topics ?? []).join(', '));
      setPeople(node?.people ?? []);
      setPersonInput('');
    }
  }

  const entity = isEntityType(type);

  // Candidate parents: every node except this one and its descendants.
  const blocked = node ? descendantsOf(node.address, hierarchy) : new Set<string>();
  const parentCandidates = allNodes.filter((n) => !blocked.has(n.address));
  const nodeTitle = (address: string) =>
    allNodes.find((n) => n.address === address)?.title ?? 'Unknown node';

  const addParent = (address: string) => {
    setParents((prev) => (prev.includes(address) ? prev : [...prev, address]));
  };
  const removeParent = (address: string) => setParents((prev) => prev.filter((p) => p !== address));

  const addPerson = () => {
    const hex = toHexPubkey(personInput);
    if (!hex) {
      toast({ title: 'Invalid npub', description: 'Enter a valid npub or hex pubkey.', variant: 'destructive' });
      return;
    }
    setPeople((prev) => (prev.includes(hex) ? prev : [...prev, hex]));
    setPersonInput('');
  };
  const removePerson = (hex: string) => setPeople((prev) => prev.filter((p) => p !== hex));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const identifier =
      node?.identifier ??
      `${slugify(title) || 'node'}-${Math.random().toString(36).slice(2, 6)}`;

    const topics = topicsInput
      .split(',')
      .map((t) => slugify(t))
      .filter(Boolean);

    // Resolve the bound identity for person nodes.
    let subject: string | undefined;
    if (type === 'person' && subjectInput.trim()) {
      const hex = toHexPubkey(subjectInput);
      if (!hex) {
        toast({
          title: 'Invalid identity',
          description: 'Enter a valid npub or hex pubkey, or leave it blank.',
          variant: 'destructive',
        });
        return;
      }
      subject = hex;
    }

    try {
      await saveNode({
        identifier,
        title,
        type,
        status,
        content,
        subject,
        parents,
        topics,
        people,
        anchors: node?.anchors,
      });
      toast({ title: node ? 'Node updated' : 'Node published' });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to publish node',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{node ? 'Edit node' : 'Add to the strategy graph'}</DialogTitle>
          <DialogDescription>
            {node
              ? 'Update your node. Only you can edit it; others coordinate through comments and connections.'
              : 'Publish a goal, problem, or task for the community to build around. You own it; anyone can connect to it.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-title">Title</Label>
            <Input
              id="node-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Interoperable DMs everywhere"
              maxLength={120}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="node-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as GraphNodeType)}>
                <SelectTrigger id="node-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Work items</SelectLabel>
                    {WORK_ITEM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {NODE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Entities</SelectLabel>
                    {ENTITY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {NODE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{TYPE_HINTS[type]}</p>
            </div>

            {/* Status is meaningless for entities; hide it for them. */}
            {!entity && (
              <div className="space-y-2">
                <Label htmlFor="node-status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as GraphNodeStatus)}>
                  <SelectTrigger id="node-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NODE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {NODE_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Identity binding for person nodes. */}
          {type === 'person' && (
            <div className="space-y-2">
              <Label htmlFor="node-subject">Nostr identity (optional)</Label>
              <Input
                id="node-subject"
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                placeholder="npub1… — shows their real avatar & links to their profile"
              />
            </div>
          )}

          {/* Parents (hierarchy) */}
          <div className="space-y-2">
            <Label htmlFor="node-parent">Parent nodes (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Nest this under broader nodes. Scale on the map comes from this hierarchy —
              a big goal with sub-tasks reads as a sun with orbiting moons.
            </p>
            {parents.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {parents.map((p) => (
                  <Badge key={p} variant="secondary" className="gap-1">
                    {nodeTitle(p)}
                    <button type="button" aria-label={`Remove ${nodeTitle(p)}`} onClick={() => removeParent(p)}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {parentCandidates.length > 0 && (
              <Select value="" onValueChange={addParent}>
                <SelectTrigger id="node-parent">
                  <SelectValue placeholder="Add a parent…" />
                </SelectTrigger>
                <SelectContent>
                  {parentCandidates
                    .filter((c) => !parents.includes(c.address))
                    .map((c) => (
                      <SelectItem key={c.address} value={c.address}>
                        {c.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Topics */}
          <div className="space-y-2">
            <Label htmlFor="node-topics">Topics (comma-separated)</Label>
            <Input
              id="node-topics"
              value={topicsInput}
              onChange={(e) => setTopicsInput(e.target.value)}
              placeholder="e.g. dms, relays, onboarding"
            />
          </div>

          {/* People */}
          <div className="space-y-2">
            <Label htmlFor="node-person">People involved (optional)</Label>
            {people.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {people.map((hex) => (
                  <Badge key={hex} variant="secondary" className="gap-1.5 pl-1">
                    <UserAvatar pubkey={hex} size="sm" showExpertBadge={false} className="size-4" />
                    <span className="max-w-24 truncate">{shortNpub(hex)}</span>
                    <button type="button" aria-label="Remove person" onClick={() => removePerson(hex)}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                id="node-person"
                value={personInput}
                onChange={(e) => setPersonInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPerson();
                  }
                }}
                placeholder="npub1… or hex pubkey"
              />
              <Button type="button" variant="outline" onClick={addPerson}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="node-content">Description (Markdown)</Label>
            <Textarea
              id="node-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What is this about? Why does it matter? Link related NIPs, apps, or repos."
              rows={5}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !title.trim()}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {node ? 'Save changes' : 'Publish node'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
