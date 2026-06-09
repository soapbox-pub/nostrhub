/**
 * Extract a short, human-readable plaintext preview from a NIP's markdown body.
 *
 * NIP documents (official and community) typically open with a metadata header
 * that is noise in a card preview, e.g.:
 *
 *   ---
 *   title: Foo
 *   ---
 *   NIP-XX
 *   ======
 *
 *   Some Title
 *   ----------
 *
 *   `draft` `optional`
 *
 *   `author: alice`
 *   `Status: proposed`
 *
 *   The first real paragraph starts here...
 *
 * This function strips frontmatter, headings (ATX + setext), status/metadata
 * lines, code fences, tables, images, and markdown formatting, then returns the
 * first meaningful prose collapsed onto a single line.
 */
export function markdownPreview(content: string, max = 200): string {
  if (!content) return '';

  let lines = content.replace(/\r\n/g, '\n').split('\n');

  // 1. Strip a leading YAML frontmatter block (--- ... ---).
  lines = stripFrontmatter(lines);

  // 2. Drop setext heading underlines by removing the underline lines and the
  //    heading text immediately above them.
  lines = stripSetextHeadings(lines);

  // 3. Collect the first run of meaningful prose paragraphs.
  const out: string[] = [];
  let inFence = false;

  for (const raw of lines) {
    const line = raw.trim();

    // Toggle fenced code blocks (``` or ~~~) and skip their contents.
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!line) {
      // Blank line: if we already have prose, that's enough for a preview.
      if (out.length) break;
      continue;
    }

    if (isSkippableLine(line)) continue;

    out.push(cleanInline(line));
  }

  const text = out.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;

  // Truncate on a word boundary when possible.
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

function stripFrontmatter(lines: string[]): string[] {
  if (lines[0]?.trim() !== '---') return lines;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return end === -1 ? lines : lines.slice(end + 1);
}

function stripSetextHeadings(lines: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1]?.trim() ?? '';
    const isUnderline = /^(=+|-{2,})$/.test(next);
    // A non-empty line followed by an underline is a setext heading.
    if (isUnderline && lines[i].trim()) {
      i++; // skip the underline; drop both the heading text and the underline
      continue;
    }
    // A lone underline (no heading above, e.g. a thematic break) is dropped.
    if (/^(=+|-{2,})$/.test(lines[i].trim())) continue;
    result.push(lines[i]);
  }
  return result;
}

/** Lines that are headers/metadata/structure rather than prose. */
function isSkippableLine(line: string): boolean {
  // ATX headings: # Heading
  if (/^#{1,6}\s/.test(line)) return true;

  // Blockquotes — NIPs use these for leading NOTE/Status callouts, which are
  // metadata noise in a preview.
  if (/^>/.test(line)) return true;

  // Horizontal rules.
  if (/^([-*_]\s*){3,}$/.test(line)) return true;

  // Table rows / separators.
  if (line.startsWith('|')) return true;

  // HTML comments / tags only.
  if (/^<!--/.test(line) || /^<\/?[a-z]/i.test(line)) return true;

  // Strip the markdown so we can inspect the bare text.
  const bare = cleanInline(line);

  // Empty after stripping (e.g. a line that was only a link to an image).
  if (!bare) return true;

  // NIP status badges: combinations of `draft`, `optional`, `mandatory`,
  // `final`, `deprecated`, `proposed`, etc. — short keyword-only lines.
  // Also tolerate a trailing `author: …` segment on the same line.
  if (/^(draft|optional|mandatory|final|deprecated|proposed|kind|unrecommended)(\s+\S+)*$/i.test(bare) && bare.length < 80) {
    return true;
  }

  // Metadata "key: value" lines (author, status, kind number, etc.),
  // but only short ones so we don't eat real prose that contains a colon.
  if (/^[A-Za-z][\w .-]{0,24}:\s*\S/.test(bare) && bare.length < 80 && !/[.!?]$/.test(bare)) {
    return true;
  }

  return false;
}

/** Strip inline markdown formatting, unwrap links/images to their text. */
function cleanInline(line: string): string {
  return line
    // Images: ![alt](url) -> drop entirely.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Links: [text](url) -> text.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Reference links: [text][ref] -> text.
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    // Bold/italic/strikethrough markers.
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    // Inline code backticks.
    .replace(/`+/g, '')
    // Leading list/quote markers.
    .replace(/^\s*([-*+]|\d+\.|>)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
