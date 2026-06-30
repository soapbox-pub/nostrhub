import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search, UserPlus } from 'lucide-react';
import { useProfileSearch } from '@/hooks/useProfileSearch';
import { resolvePubkey, shortNpub } from '@/lib/nostr';
import { UserAvatar } from '@/components/UserAvatar';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Debounce a changing value. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

interface ExpertSearchInputProps {
  /** Invoked with a hex pubkey when a profile (or a pasted npub/hex) is chosen. */
  onSelect: (pubkey: string) => void;
  /** Pubkeys already in the list — rendered as "Added". */
  existing?: string[];
  placeholder?: string;
}

interface Item {
  pubkey: string;
  /** A directly-pasted npub/hex rather than a name match. */
  raw: boolean;
  name?: string;
  nip05?: string;
}

/**
 * Debounced user autocomplete: searches kind-0 profiles by name via NIP-50 on
 * the Ditto relay, and also accepts a pasted npub/hex pubkey directly. Selecting
 * a result resolves it to a hex pubkey passed to `onSelect`.
 */
export function ExpertSearchInput({ onSelect, existing = [], placeholder }: ExpertSearchInputProps) {
  const [query, setQuery] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounced(query, 300);
  const trimmed = debouncedQuery.trim();
  const { data: results, isFetching } = useProfileSearch(debouncedQuery);

  const existingSet = new Set(existing);

  // A directly-pasted npub/hex resolves immediately, independent of the search.
  const rawPubkey = resolvePubkey(query);

  const items: Item[] = [];
  if (rawPubkey && !(results ?? []).some((r) => r.pubkey === rawPubkey)) {
    items.push({ pubkey: rawPubkey, raw: true });
  }
  for (const r of results ?? []) {
    items.push({
      pubkey: r.pubkey,
      raw: false,
      name: r.metadata.name || r.metadata.display_name || shortNpub(r.pubkey),
      nip05: r.metadata.nip05,
    });
  }

  // Reset the highlighted row when the result set changes (adjusting state
  // during render — cheaper and safer than a synchronizing effect).
  const [prevKey, setPrevKey] = useState('');
  const itemsKey = items.map((i) => i.pubkey).join('|');
  if (itemsKey !== prevKey) {
    setPrevKey(itemsKey);
    setActiveIndex(-1);
  }

  const open = !dismissed && trimmed.length > 0;
  const showEmpty = open && !isFetching && items.length === 0;

  const select = (item: Item) => {
    onSelect(item.pubkey);
    setQuery('');
    setActiveIndex(-1);
    // Keep focus so several experts can be added in a row.
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setDismissed(true);
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) select(items[activeIndex]);
      else if (items.length > 0) select(items[0]);
      return;
    }
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => setDismissed(!o)}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-label="Search for a person by name, npub, or hex pubkey"
            placeholder={placeholder ?? 'Search by name, npub, or hex pubkey…'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDismissed(false);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setDismissed(false)}
            className="pl-9"
          />
          {isFetching && (
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
            No profiles found for “{trimmed}”.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {items.map((item, i) => {
              const added = existingSet.has(item.pubkey);
              return (
                <li key={item.pubkey}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => select(item)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                      activeIndex === i ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                    )}
                  >
                    <UserAvatar pubkey={item.pubkey} size="sm" showExpertBadge={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.raw ? 'Add this pubkey' : item.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.raw ? shortNpub(item.pubkey) : item.nip05 ?? shortNpub(item.pubkey)}
                      </span>
                    </span>
                    {added ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Check className="size-3.5" /> Added
                      </span>
                    ) : (
                      <UserPlus className="size-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default ExpertSearchInput;
