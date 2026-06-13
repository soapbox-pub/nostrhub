import { useState } from 'react';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { useSaveGraphEdge } from '@/hooks/useSaveGraphEdge';
import {
  EDGE_TYPES,
  EDGE_TYPE_LABELS,
  type GraphEdgeType,
  type GraphNode,
} from '@/lib/strategyGraph';

interface EdgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The node the connection was started from. */
  source: GraphNode | null;
  /** The node that was clicked as the connection target. */
  target: GraphNode | null;
}

/** Choose the relation type (and direction) for a new edge between two nodes. */
export function EdgeDialog({ open, onOpenChange, source, target }: EdgeDialogProps) {
  const { toast } = useToast();
  const { mutateAsync: saveEdge, isPending } = useSaveGraphEdge();
  const [type, setType] = useState<GraphEdgeType>('depends-on');
  const [swapped, setSwapped] = useState(false);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');

  // Reset choices whenever the dialog opens (render-phase adjustment).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setType('depends-on');
      setSwapped(false);
      setLabel('');
      setNotes('');
    }
  }

  if (!source || !target) return null;

  const from = swapped ? target : source;
  const to = swapped ? source : target;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveEdge({ from: from.address, to: to.address, type, label, notes });
      toast({ title: 'Connection published' });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to publish connection',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect nodes</DialogTitle>
          <DialogDescription>
            Declare how these two nodes relate. Anyone can connect any nodes — the
            connection is published under your key.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
            <span className="font-medium">{from.title}</span>{' '}
            <span className="text-muted-foreground">{EDGE_TYPE_LABELS[type]}</span>{' '}
            <span className="font-medium">{to.title}</span>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="edge-type">Relation</Label>
              <Select value={type} onValueChange={(v) => setType(v as GraphEdgeType)}>
                <SelectTrigger id="edge-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {EDGE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Swap direction"
              title="Swap direction"
              disabled={type === 'relates'}
              onClick={() => setSwapped((s) => !s)}
            >
              <ArrowLeftRight className="size-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edge-label">Label (optional)</Label>
            <Input
              id="edge-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. needs NIP-44 first"
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edge-notes">Notes (optional, Markdown)</Label>
            <Textarea
              id="edge-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why does this relationship exist?"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Publish connection
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

