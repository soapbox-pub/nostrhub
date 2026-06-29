import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { MAX_HIGHLIGHT_LENGTH } from '@/lib/highlightSource';

export interface TextSelection {
  /** Normalized selected text. */
  text: string;
  /** Surrounding block-level context, if usefully distinct from the text. */
  context?: string;
  /** Bounding rect of the selection in viewport coordinates. */
  rect: DOMRect;
}

/** Collapse runs of whitespace and trim, the way relays/clients expect. */
function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Walk up to the nearest block-level ancestor inside the container. */
function findBlockAncestor(node: Node | null, container: HTMLElement): HTMLElement | null {
  const BLOCK = new Set(['P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'PRE']);
  let el: Node | null = node;
  while (el && el !== container) {
    if (el.nodeType === Node.ELEMENT_NODE && BLOCK.has((el as HTMLElement).tagName)) {
      return el as HTMLElement;
    }
    el = el.parentNode;
  }
  return null;
}

/**
 * Track text selections that fall entirely within `containerRef`. Returns the
 * current selection (debounced) or null. The caller renders a floating action
 * from `selection.rect` and clears via `clear()`.
 */
export function useTextSelection(containerRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    setSelection(null);
    const sel = window.getSelection();
    sel?.removeAllRanges();
  }, []);

  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return setSelection(null);

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setSelection(null);

    const range = sel.getRangeAt(0);

    // Both endpoints must be inside the highlightable container.
    if (
      !container.contains(range.startContainer) ||
      !container.contains(range.endContainer)
    ) {
      return setSelection(null);
    }

    const text = normalizeText(sel.toString());
    if (!text || text.length > MAX_HIGHLIGHT_LENGTH) return setSelection(null);

    // Derive context from the surrounding block, but only keep it when it
    // actually contains the highlight and adds something beyond it.
    let context: string | undefined;
    const block = findBlockAncestor(range.startContainer, container);
    if (block) {
      const blockText = normalizeText(block.textContent ?? '');
      if (blockText.includes(text) && blockText.length > text.length) {
        context = blockText;
      }
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return setSelection(null);

    setSelection({ text, context, rect });
  }, [containerRef]);

  useEffect(() => {
    const onSelectionChange = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(compute, 250);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [compute]);

  return { selection, clear };
}
