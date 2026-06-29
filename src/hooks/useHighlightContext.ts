import { useContext } from 'react';
import { HighlightContext, type HighlightContextValue } from '@/lib/highlightMatch';

export function useHighlightContext(): HighlightContextValue | null {
  return useContext(HighlightContext);
}
