import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, FileText, Users } from 'lucide-react';
import { useNipSearch } from '@/hooks/useNipSearch';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { shortNpub } from '@/lib/nostr';
import { useAuthor } from '@/hooks/useAuthor';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MAX_OFFICIAL = 5;

/** Debounce a changing value. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

interface SearchResult {
  href: string;
  title: string;
  subtitle?: string;
  author?: string;
  kind: 'official' | 'community';
}

function CommunityResultAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name =
    author.data?.metadata?.name || author.data?.metadata?.display_name || shortNpub(pubkey);
  return <>by {name}</>;
}

export function SearchBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounced(query, 250);
  const trimmed = debouncedQuery.trim();

  const { data: communityNips, isFetching: communityLoading } = useNipSearch(trimmed);
  const { data: officialNips } = useOfficialNips();

  // Client-side filter the official NIP index by title / number.
  const officialMatches = useMemo<SearchResult[]>(() => {
    if (!trimmed || !officialNips) return [];
    const q = trimmed.toLowerCase();
    return officialNips
      .filter(
        (n) => n.title.toLowerCase().includes(q) || `nip-${n.number}`.toLowerCase().includes(q),
      )
      .slice(0, MAX_OFFICIAL)
      .map((n) => ({
        href: `/nip/${n.number}`,
        title: n.title,
        subtitle: `NIP-${n.number}`,
        kind: 'official' as const,
      }));
  }, [trimmed, officialNips]);

  const communityMatches = useMemo<SearchResult[]>(
    () =>
      (communityNips ?? []).map((n) => ({
        href: `/${n.naddr}`,
        title: n.title,
        author: n.author,
        kind: 'community' as const,
      })),
    [communityNips],
  );

  const results = useMemo(
    () => [...officialMatches, ...communityMatches],
    [officialMatches, communityMatches],
  );

  // Reset the highlighted row whenever the result set changes (adjusting state
  // during render — cheaper and safer than a synchronizing effect).
  const [prevResultsKey, setPrevResultsKey] = useState('');
  const resultsKey = results.map((r) => r.href).join('|');
  if (resultsKey !== prevResultsKey) {
    setPrevResultsKey(resultsKey);
    setActiveIndex(-1);
  }

  const open = !dismissed && trimmed.length > 0;

  const select = (result: SearchResult) => {
    navigate(result.href);
    setDismissed(true);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setDismissed(true);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      select(results[activeIndex]);
    }
  };

  const showEmpty = open && trimmed.length > 0 && !communityLoading && results.length === 0;

  return (
    <Popover open={open} onOpenChange={(o) => setDismissed(!o)}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-label="Search NIPs"
            placeholder="Search NIPs…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDismissed(false);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setDismissed(false)}
            className="h-9 rounded-full pl-9 pr-9"
          />
          {communityLoading && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-(--radix-popover-trigger-width) p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {showEmpty ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No NIPs found for “{trimmed}”.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {results.map((result, i) => (
              <li key={`${result.kind}-${result.href}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => select(result)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                    activeIndex === i ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                  )}
                >
                  {result.kind === 'official' ? (
                    <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : (
                    <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{result.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.subtitle ??
                        (result.author ? <CommunityResultAuthor pubkey={result.author} /> : 'Community draft')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default SearchBar;
