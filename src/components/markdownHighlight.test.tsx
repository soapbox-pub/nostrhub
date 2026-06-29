import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { MarkdownContent } from '@/components/MarkdownContent';
import { HighlightProvider } from '@/components/markdownHighlight';
import { normalizeText, type HighlightMatcher } from '@/lib/highlightMatch';
import type { ParsedHighlight } from '@/lib/highlightSource';

function makeHighlight(text: string, comment: string): ParsedHighlight {
  const event: NostrEvent = {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: 0,
    kind: 9802,
    content: text,
    tags: [['comment', comment]],
    sig: '',
  };
  return { event, text, comment };
}

function renderWithHighlights(content: string, highlights: ParsedHighlight[]) {
  const matchers: HighlightMatcher[] = highlights.map((h) => ({
    needle: normalizeText(h.text),
    highlight: h,
  }));
  return render(
    <BrowserRouter>
      <HighlightProvider matchers={matchers} onActivate={() => {}} onHover={() => {}}>
        <MarkdownContent content={content} />
      </HighlightProvider>
    </BrowserRouter>,
  );
}

describe('markdown highlighting', () => {
  it('marks an excerpt that spans across a Markdown link', () => {
    const content =
      'This week, Alex Gleason [announced](https://soapbox.pub/blog/nostrhub-2) the release of NostrHub 2.0, a nostr-native place.';
    const highlight = makeHighlight(
      'Alex Gleason announced the release of NostrHub 2.0',
      'I was mentioned!',
    );

    const { container } = renderWithHighlights(content, [highlight]);

    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);

    // The combined text of all marks should reconstruct the full excerpt,
    // including the linked word in the middle.
    const markedText = Array.from(marks)
      .map((m) => m.textContent ?? '')
      .join('');
    expect(normalizeText(markedText)).toContain(
      normalizeText('Alex Gleason announced the release of NostrHub 2.0'),
    );

    // The link must still be a real anchor (not swallowed into plain text).
    const link = container.querySelector('a[href="https://soapbox.pub/blog/nostrhub-2"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe('announced');
    // And the linked word is part of the highlight (a mark inside the anchor,
    // or the anchor inside a mark).
    expect(link?.closest('mark') || link?.querySelector('mark')).not.toBeNull();
  });

  it('marks a simple excerpt within a single paragraph', () => {
    const content = 'Relays only index single-letter tags. Use t for categories.';
    const highlight = makeHighlight('Relays only index single-letter tags', 'key rule');

    const { container } = renderWithHighlights(content, [highlight]);
    const marks = container.querySelectorAll('mark');
    const markedText = Array.from(marks)
      .map((m) => m.textContent ?? '')
      .join('');
    expect(markedText).toContain('Relays only index single-letter tags');
  });

  it('does not mark anything when the excerpt is absent', () => {
    const content = 'Nothing here matches.';
    const highlight = makeHighlight('a passage that is not present', 'comment');
    const { container } = renderWithHighlights(content, [highlight]);
    expect(container.querySelectorAll('mark').length).toBe(0);
  });
});
