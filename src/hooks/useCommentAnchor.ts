import { useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** The URL-hash anchor for a comment id, GitHub-permalink style. */
export function commentAnchor(commentId: string): string {
  return `comment-${commentId}`;
}

/**
 * GitHub-style comment permalinks: when the URL hash is `#comment-<id>`, the
 * matching comment card scrolls into view (once, when it mounts — comments
 * load asynchronously, so a native anchor jump would fire too early) and
 * reports itself as the target so the caller can render a highlight ring.
 */
export function useCommentAnchor(commentId: string): {
  ref: (node: HTMLElement | null) => void;
  isTarget: boolean;
  domId: string;
} {
  const { hash } = useLocation();
  const domId = commentAnchor(commentId);
  const isTarget = hash === `#${domId}`;
  const scrolled = useRef(false);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !isTarget || scrolled.current) return;
      scrolled.current = true;
      // Let layout settle before jumping (ScrollToTop resets to 0 on nav).
      requestAnimationFrame(() => {
        node.scrollIntoView({ block: 'center' });
      });
    },
    [isTarget],
  );

  return { ref, isTarget, domId };
}
