import { useEffect, useRef, useState } from 'react';
import { Highlighter } from 'lucide-react';
import type { RefObject } from 'react';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useCreateHighlight } from '@/hooks/useCreateHighlight';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import type { HighlightSource } from '@/lib/highlightSource';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PendingSelection {
  text: string;
  context?: string;
}

interface HighlightSelectionPopoverProps {
  containerRef: RefObject<HTMLElement | null>;
  source: HighlightSource | undefined;
}

/**
 * Watches for text selections inside `containerRef` and shows a floating
 * "Highlight" button. Confirming opens a dialog requiring a comment, then
 * publishes a kind-9802 highlight.
 */
export function HighlightSelectionPopover({ containerRef, source }: HighlightSelectionPopoverProps) {
  const { user } = useCurrentUser();
  const { selection, clear } = useTextSelection(containerRef);
  const { mutateAsync: createHighlight, isPending } = useCreateHighlight();
  const { toast } = useToast();

  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [comment, setComment] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the comment box when the dialog opens.
  useEffect(() => {
    if (pending) {
      const id = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [pending]);

  // Only logged-in users can highlight, and only when we know the source.
  if (!user || !source) return null;

  const openDialog = () => {
    if (!selection) return;
    setPending({ text: selection.text, context: selection.context });
    setComment('');
    clear();
  };

  const closeDialog = () => {
    setPending(null);
    setComment('');
  };

  const handleSubmit = async () => {
    if (!pending || !comment.trim()) return;
    try {
      await createHighlight({
        text: pending.text,
        context: pending.context,
        comment,
        source,
      });
      toast({ title: 'Highlight published' });
      closeDialog();
    } catch (error) {
      toast({
        title: 'Failed to publish highlight',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      {selection && !pending && (
        <div
          className="fixed z-50 -translate-x-1/2 -translate-y-full pb-2"
          style={{
            left: selection.rect.left + selection.rect.width / 2,
            top: selection.rect.top,
          }}
          // Keep the selection alive: don't let mousedown collapse it.
          onMouseDown={(e) => e.preventDefault()}
        >
          <Button
            size="sm"
            onClick={openDialog}
            className="gap-1.5 shadow-lg"
          >
            <Highlighter className="size-4" aria-hidden="true" />
            Highlight
          </Button>
        </div>
      )}

      <Dialog open={!!pending} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a highlight</DialogTitle>
            <DialogDescription>
              Share why this passage matters. A comment is required.
            </DialogDescription>
          </DialogHeader>

          {pending && (
            <div className="space-y-4">
              <blockquote className="max-h-40 overflow-y-auto rounded-r-lg border-l-4 border-primary/60 bg-primary/5 px-4 py-3 text-sm leading-relaxed">
                <span className="rounded bg-primary/20 px-0.5">{pending.text}</span>
              </blockquote>

              <div className="space-y-2">
                <Label htmlFor="highlight-comment">Your comment</Label>
                <Textarea
                  id="highlight-comment"
                  ref={textareaRef}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Why is this worth highlighting?"
                  rows={4}
                  maxLength={2000}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !comment.trim()}>
              {isPending ? 'Publishing…' : 'Publish highlight'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
