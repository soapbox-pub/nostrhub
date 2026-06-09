import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface ChatMessageContentProps {
  content: string;
}

// Matches https URLs and nostr: / bare bech32 entity mentions.
const TOKEN_SOURCE =
  '(https?:\\/\\/[^\\s]+)|(nostr:(?:npub1|nprofile1|note1|nevent1|naddr1)[0-9a-z]+)|((?:npub1|nprofile1|note1|nevent1|naddr1)[0-9a-z]{20,})';

/**
 * Render chat message text as safe React nodes: plain text with https links and
 * Nostr mentions linkified. No raw HTML is ever produced, so this is safe
 * against XSS from untrusted event content.
 */
export function ChatMessageContent({ content }: ChatMessageContentProps) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    // Fresh, stateful regex per render to avoid shared mutable state.
    const re = new RegExp(TOKEN_SOURCE, 'gi');

    while ((match = re.exec(content)) !== null) {
      const [token, urlMatch, nostrMatch, bareMatch] = match;
      const start = match.index;

      if (start > lastIndex) {
        out.push(<Fragment key={key++}>{content.slice(lastIndex, start)}</Fragment>);
      }

      if (urlMatch) {
        const safe = sanitizeUrl(urlMatch);
        if (safe) {
          out.push(
            <a
              key={key++}
              href={safe}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline break-all"
            >
              {urlMatch}
            </a>,
          );
        } else {
          out.push(<Fragment key={key++}>{urlMatch}</Fragment>);
        }
      } else {
        const entity = (nostrMatch ?? bareMatch ?? token).replace(/^nostr:/i, '');
        out.push(
          <Link
            key={key++}
            to={`/${entity}`}
            className="font-medium text-primary underline-offset-4 hover:underline break-all"
          >
            {token}
          </Link>,
        );
      }

      lastIndex = start + token.length;
    }

    if (lastIndex < content.length) {
      out.push(<Fragment key={key}>{content.slice(lastIndex)}</Fragment>);
    }

    return out;
  }, [content]);

  return <span className="whitespace-pre-wrap break-words">{nodes}</span>;
}

export default ChatMessageContent;
