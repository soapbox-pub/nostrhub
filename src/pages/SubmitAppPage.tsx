import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  ArrowLeft, AlertCircle, BookOpen, Check, FolderGit2,
  Loader2, PlusCircle, Search, ShoppingBag, X,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Layout } from '@/components/Layout';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useNipSearch } from '@/hooks/useNipSearch';
import { useGitRepos } from '@/hooks/useGitRepos';
import { useGitRepoSearch } from '@/hooks/useGitRepoSearch';
import { useMyZapstoreApps, useZapstoreSearch } from '@/hooks/useZapstoreSearch';
import { useToast } from '@/hooks/useToast';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { APP_PLATFORMS, APP_HANDLER_KIND, nipGithubUrl, type AppPlatform } from '@/lib/apps';
import type { CustomNip } from '@/lib/nips';
import type { GitRepoAnnouncement } from '@/lib/git';
import type { ZapstoreApp } from '@/hooks/useZapstoreSearch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<AppPlatform, string> = {
  web: 'Web', ios: 'iOS', android: 'Android', desktop: 'Desktop',
  linux: 'Linux', macos: 'macOS', windows: 'Windows',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformEntry {
  platform: AppPlatform;
  url: string;
  hint: string;
}

interface KindEntry {
  value: string;
}

interface NipRefEntry {
  type: 'official' | 'custom';
  /** NIP number e.g. "01" — only when type='official'. */
  number: string;
  /** "30817:<pubkey>:<d>" — only when type='custom'. */
  address: string;
  relayHint: string;
}

interface RepoRefEntry {
  address: string; // "30617:<pubkey>:<d>"
  relayHint: string;
  /** Display name resolved from the event. */
  name: string;
}

interface ZapstoreRefEntry {
  address: string; // "32267:<pubkey>:<d>"
  relayHint: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateDTag(): string {
  return Math.random().toString(36).slice(2, 10);
}

function isValidUrl(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function isValidWsUrl(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'ws:' || u.protocol === 'wss:'; }
  catch { return false; }
}

// ---------------------------------------------------------------------------
// Reusable scroll-list + search picker sub-components
// ---------------------------------------------------------------------------

/** A single row in the "your items" scroll list or search results. */
function PickRow({
  icon, label, sublabel, selected, onToggle,
}: {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'bg-primary/10 text-foreground ring-1 ring-primary/30'
          : 'hover:bg-muted/50 text-foreground',
      )}
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {sublabel && <span className="block truncate text-xs text-muted-foreground">{sublabel}</span>}
      </span>
      {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

/** Selected-items chips strip shown at the top of a reference card. */
function SelectedChips({
  items, onRemove,
}: {
  items: Array<{ key: string; label: string }>;
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ key, label }) => (
        <Badge key={key} variant="secondary" className="gap-1 pr-1 font-mono text-xs">
          {label}
          <button
            type="button"
            onClick={() => onRemove(key)}
            className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={`Remove ${label}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NIP picker
// ---------------------------------------------------------------------------

function NipPicker({
  nipRefs, setNipRefs, kindToNips, pubkey,
}: {
  nipRefs: NipRefEntry[];
  setNipRefs: React.Dispatch<React.SetStateAction<NipRefEntry[]>>;
  kindToNips: Map<number, string[]>;
  pubkey: string;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 350);
  const myNips = useCustomNips({ authors: [pubkey], limit: 200 });
  const searchResults = useNipSearch(debouncedQuery, 15);
  const officialNips = useOfficialNips();

  // All NIP numbers already in use
  const selectedOfficialNums = new Set(
    nipRefs.filter((r) => r.type === 'official').map((r) => r.number),
  );
  const selectedCustomAddrs = new Set(
    nipRefs.filter((r) => r.type === 'custom').map((r) => r.address),
  );

  // Inferred suggestions from entered kinds
  const kindInferred = useMemo(() => {
    const nums = new Set<string>();
    return Array.from(nums).filter((n) => !selectedOfficialNums.has(n));
  }, [kindToNips, selectedOfficialNums]);
  void kindInferred; // used by parent

  const toggleOfficial = (num: string) => {
    if (selectedOfficialNums.has(num)) {
      setNipRefs((prev) => prev.filter((r) => !(r.type === 'official' && r.number === num)));
    } else {
      setNipRefs((prev) => [...prev, { type: 'official', number: num, address: '', relayHint: '' }]);
    }
  };

  const toggleCustom = (nip: CustomNip) => {
    if (selectedCustomAddrs.has(nip.address)) {
      setNipRefs((prev) => prev.filter((r) => !(r.type === 'custom' && r.address === nip.address)));
    } else {
      setNipRefs((prev) => [...prev, {
        type: 'custom', number: '', address: nip.address,
        relayHint: '',
      }]);
    }
  };

  const chips = nipRefs.map((r) =>
    r.type === 'official'
      ? { key: `official:${r.number}`, label: `NIP-${r.number}` }
      : { key: `custom:${r.address}`, label: `custom:…${r.address.slice(-8)}` },
  );
  const removeByKey = (key: string) => {
    if (key.startsWith('official:')) {
      const num = key.slice('official:'.length);
      setNipRefs((prev) => prev.filter((r) => !(r.type === 'official' && r.number === num)));
    } else {
      const addr = key.slice('custom:'.length);
      setNipRefs((prev) => prev.filter((r) => !(r.type === 'custom' && r.address === addr)));
    }
  };

  // What to show in the list: search results if querying, else your own NIPs
  const showSearch = debouncedQuery.length > 0;

  return (
    <div className="space-y-3">
      <SelectedChips items={chips} onRemove={removeByKey} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search NIPs…"
          aria-label="Search NIPs"
          className="pl-9"
        />
        {searchResults.isFetching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {/* Scroll list */}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-background">
        {showSearch ? (
          searchResults.isLoading ? (
            <div className="space-y-1 p-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
            </div>
          ) : (searchResults.data?.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No NIPs found for "{debouncedQuery}"
            </p>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {/* Custom NIP results */}
              {searchResults.data!.map((nip) => (
                <PickRow
                  key={nip.address}
                  icon={<BookOpen className="size-3.5" />}
                  label={nip.title}
                  sublabel={`custom · ${nip.identifier}`}
                  selected={selectedCustomAddrs.has(nip.address)}
                  onToggle={() => toggleCustom(nip)}
                />
              ))}
              {/* Official NIP matches by number/title from local list */}
              {(officialNips.data ?? [])
                .filter((n) => !n.deprecated &&
                  (n.number.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
                   n.title.toLowerCase().includes(debouncedQuery.toLowerCase())))
                .slice(0, 8)
                .map((n) => (
                  <PickRow
                    key={n.number}
                    icon={<BookOpen className="size-3.5" />}
                    label={`NIP-${n.number}: ${n.title}`}
                    sublabel="official"
                    selected={selectedOfficialNums.has(n.number)}
                    onToggle={() => toggleOfficial(n.number)}
                  />
                ))}
            </div>
          )
        ) : (
          /* Browse: your own custom NIPs */
          myNips.isLoading ? (
            <div className="space-y-1 p-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
            </div>
          ) : (myNips.data?.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              You haven't published any custom NIPs yet. Search to add official NIPs.
            </p>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {myNips.data!.map((nip) => (
                <PickRow
                  key={nip.address}
                  icon={<BookOpen className="size-3.5" />}
                  label={nip.title}
                  sublabel={`custom · ${nip.identifier}`}
                  selected={selectedCustomAddrs.has(nip.address)}
                  onToggle={() => toggleCustom(nip)}
                />
              ))}
            </div>
          )
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Your custom NIPs appear by default. Search to find official NIPs (by number or title) or
        community NIPs published by others.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Repo picker
// ---------------------------------------------------------------------------

function RepoPicker({
  repoRefs, setRepoRefs, pubkey,
}: {
  repoRefs: RepoRefEntry[];
  setRepoRefs: React.Dispatch<React.SetStateAction<RepoRefEntry[]>>;
  pubkey: string;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 350);
  const myRepos = useGitRepos({ authors: [pubkey], limit: 200 });
  const searchResults = useGitRepoSearch(debouncedQuery, 15);

  const selectedAddrs = new Set(repoRefs.map((r) => r.address));

  const toggle = (repo: GitRepoAnnouncement) => {
    const address = `30617:${repo.pubkey}:${repo.identifier}`;
    if (selectedAddrs.has(address)) {
      setRepoRefs((prev) => prev.filter((r) => r.address !== address));
    } else {
      setRepoRefs((prev) => [...prev, {
        address,
        relayHint: repo.relays[0] ?? '',
        name: repo.name,
      }]);
    }
  };

  const chips = repoRefs.map((r) => ({ key: r.address, label: r.name || r.address.split(':')[2] }));

  const showSearch = debouncedQuery.length > 0;
  const listRepos = showSearch ? (searchResults.data ?? []) : (myRepos.data ?? []);
  const isLoading = showSearch ? searchResults.isLoading : myRepos.isLoading;

  return (
    <div className="space-y-3">
      <SelectedChips items={chips} onRemove={(key) => setRepoRefs((prev) => prev.filter((r) => r.address !== key))} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search repos…"
          aria-label="Search git repositories"
          className="pl-9"
        />
        {(showSearch ? searchResults.isFetching : myRepos.isFetching) && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-background">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : listRepos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {showSearch
              ? `No repos found for "${debouncedQuery}"`
              : "You haven't announced any git repos on Nostr yet."}
          </p>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {listRepos.map((repo) => {
              const address = `30617:${repo.pubkey}:${repo.identifier}`;
              return (
                <PickRow
                  key={address}
                  icon={<FolderGit2 className="size-3.5" />}
                  label={repo.name}
                  sublabel={repo.description || repo.identifier}
                  selected={selectedAddrs.has(address)}
                  onToggle={() => toggle(repo)}
                />
              );
            })}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Your NIP-34 git repos appear by default. Search to find any public repository.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zapstore picker
// ---------------------------------------------------------------------------

function ZapstorePicker({
  zapstoreRefs, setZapstoreRefs, pubkey,
}: {
  zapstoreRefs: ZapstoreRefEntry[];
  setZapstoreRefs: React.Dispatch<React.SetStateAction<ZapstoreRefEntry[]>>;
  pubkey: string;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 350);
  const myApps = useMyZapstoreApps(pubkey);
  const searchResults = useZapstoreSearch(debouncedQuery, 15);

  const selectedAddrs = new Set(zapstoreRefs.map((r) => r.address));

  const toggle = (app: ZapstoreApp) => {
    if (selectedAddrs.has(app.address)) {
      setZapstoreRefs((prev) => prev.filter((r) => r.address !== app.address));
    } else {
      setZapstoreRefs((prev) => [...prev, {
        address: app.address,
        relayHint: '',
        name: app.name,
      }]);
    }
  };

  const chips = zapstoreRefs.map((r) => ({ key: r.address, label: r.name || r.address.split(':')[2] }));

  const showSearch = debouncedQuery.length > 0;
  const listApps = showSearch ? (searchResults.data ?? []) : (myApps.data ?? []);
  const isLoading = showSearch ? searchResults.isLoading : myApps.isLoading;

  return (
    <div className="space-y-3">
      <SelectedChips items={chips} onRemove={(key) => setZapstoreRefs((prev) => prev.filter((r) => r.address !== key))} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Zapstore…"
          aria-label="Search Zapstore app listings"
          className="pl-9"
        />
        {(showSearch ? searchResults.isFetching : myApps.isFetching) && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-background">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : listApps.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {showSearch
              ? `No Zapstore listings found for "${debouncedQuery}"`
              : "You haven't published any Zapstore listings yet."}
          </p>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {listApps.map((app) => (
              <PickRow
                key={app.address}
                icon={
                  app.icon
                    ? <img src={app.icon} alt="" className="size-5 rounded object-cover" />
                    : <ShoppingBag className="size-3.5" />
                }
                label={app.name}
                sublabel={app.summary || app.identifier}
                selected={selectedAddrs.has(app.address)}
                onToggle={() => toggle(app)}
              />
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Your Zapstore listings appear by default. Search to find any published app listing.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debounce hook (local — mirrors the one in AppsPage)
// ---------------------------------------------------------------------------

function useDebounced(value: string, delay = 400): string {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SubmitAppPage() {
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const navigate = useNavigate();
  const officialNips = useOfficialNips();

  // --- form state ---
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [picture, setPicture] = useState('');
  const [website, setWebsite] = useState('');
  const [nip05, setNip05] = useState('');
  const [kinds, setKinds] = useState<KindEntry[]>([{ value: '' }]);
  const [platforms, setPlatforms] = useState<PlatformEntry[]>([{ platform: 'web', url: '', hint: '' }]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [nipRefs, setNipRefs] = useState<NipRefEntry[]>([]);
  const [repoRefs, setRepoRefs] = useState<RepoRefEntry[]>([]);
  const [zapstoreRefs, setZapstoreRefs] = useState<ZapstoreRefEntry[]>([]);

  useSeoMeta({
    title: 'Submit an App | NostrHub',
    description: 'Announce your Nostr application as a NIP-89 handler event so the community can discover it.',
  });

  // Build kind → NIP number mapping from the live official NIP index.
  const kindToNips = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const nip of officialNips.data ?? []) {
      if (nip.deprecated) continue;
      for (const ek of nip.eventKinds ?? []) {
        const rangeMatch = ek.kind.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          for (let k = parseInt(rangeMatch[1], 10); k <= parseInt(rangeMatch[2], 10); k++) {
            if (!map.has(k)) map.set(k, []);
            if (!map.get(k)!.includes(nip.number)) map.get(k)!.push(nip.number);
          }
        } else {
          const k = parseInt(ek.kind, 10);
          if (!Number.isNaN(k)) {
            if (!map.has(k)) map.set(k, []);
            if (!map.get(k)!.includes(nip.number)) map.get(k)!.push(nip.number);
          }
        }
      }
    }
    return map;
  }, [officialNips.data]);

  // NIP numbers inferred from the entered kinds, not yet added.
  const suggestedNips = useMemo(() => {
    const already = new Set(nipRefs.filter((r) => r.type === 'official').map((r) => r.number));
    const nums = new Set<string>();
    for (const k of kinds) {
      const n = parseInt(k.value, 10);
      if (!Number.isNaN(n)) for (const num of kindToNips.get(n) ?? []) nums.add(num);
    }
    return Array.from(nums).filter((n) => !already.has(n)).sort();
  }, [kinds, kindToNips, nipRefs]);

  // --- kind helpers ---
  const addKind = () => setKinds((p) => [...p, { value: '' }]);
  const removeKind = (i: number) => setKinds((p) => p.filter((_, idx) => idx !== i));
  const updateKind = (i: number, v: string) => setKinds((p) => p.map((k, idx) => idx === i ? { value: v } : k));

  // --- platform helpers ---
  const addPlatform = () => setPlatforms((p) => [...p, { platform: 'web', url: '', hint: '' }]);
  const removePlatform = (i: number) => setPlatforms((p) => p.filter((_, idx) => idx !== i));
  const updatePlatform = (i: number, patch: Partial<PlatformEntry>) =>
    setPlatforms((p) => p.map((pl, idx) => idx === i ? { ...pl, ...patch } : pl));

  // --- tag helpers ---
  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t || tags.includes(t)) return;
    setTags((p) => [...p, t]);
  };

  // --- submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast({ title: 'App name is required', variant: 'destructive' }); return; }
    if (!about.trim()) { toast({ title: 'Description is required', variant: 'destructive' }); return; }
    if (!picture.trim() || !isValidUrl(picture.trim())) { toast({ title: 'A valid picture URL (https) is required', variant: 'destructive' }); return; }
    if (!website.trim() || !isValidUrl(website.trim())) { toast({ title: 'A valid website URL (https) is required', variant: 'destructive' }); return; }
    if (nip05.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nip05.trim())) { toast({ title: 'NIP-05 identifier looks invalid', variant: 'destructive' }); return; }

    const parsedKinds = kinds.map((k) => parseInt(k.value.trim(), 10)).filter((n) => Number.isInteger(n) && n >= 0);
    if (parsedKinds.length === 0) { toast({ title: 'At least one supported event kind is required', variant: 'destructive' }); return; }

    const validPlatforms = platforms.filter((p) => p.url.trim());
    for (const p of validPlatforms) {
      if (!isValidUrl(p.url.trim()) && !isValidWsUrl(p.url.trim())) {
        toast({ title: `Invalid URL for ${PLATFORM_LABELS[p.platform]}`, description: 'Must start with http://, https://, ws://, or wss://', variant: 'destructive' });
        return;
      }
    }

    const metadata: Record<string, string> = { name: name.trim(), about: about.trim(), picture: picture.trim(), website: website.trim() };
    if (nip05.trim()) metadata.nip05 = nip05.trim();

    const eventTags: string[][] = [
      ['d', generateDTag()],
      ['alt', `NIP-89 handler: ${name.trim()}`],
    ];

    for (const k of parsedKinds) eventTags.push(['k', String(k)]);
    for (const p of validPlatforms) {
      const row: string[] = [p.platform, p.url.trim()];
      if (p.hint.trim()) row.push(p.hint.trim());
      eventTags.push(row);
    }
    for (const t of tags) eventTags.push(['t', t]);

    // NIP refs: official → NIP-73 GitHub URL `i` tag; custom → plain `a` tag.
    for (const ref of nipRefs) {
      if (ref.type === 'official') eventTags.push(['i', nipGithubUrl(ref.number)]);
      else eventTags.push(['a', ref.address, ref.relayHint]);
    }
    // Repo refs: plain `a` tag — "30617:" prefix is unambiguous.
    for (const ref of repoRefs) eventTags.push(['a', ref.address, ref.relayHint]);
    // Zapstore refs: plain `a` tag — "32267:" prefix is unambiguous.
    for (const ref of zapstoreRefs) eventTags.push(['a', ref.address, ref.relayHint]);

    try {
      const event = await publish({ kind: APP_HANDLER_KIND, content: JSON.stringify(metadata), tags: eventTags });
      const naddr = nip19.naddrEncode({
        kind: APP_HANDLER_KIND,
        pubkey: event.pubkey,
        identifier: event.tags.find(([n]) => n === 'd')?.[1] ?? '',
      });
      toast({ title: 'App submitted successfully!' });
      navigate(`/${naddr}`);
    } catch (err) {
      toast({ title: 'Failed to publish', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to="/apps"><ArrowLeft className="mr-1.5 size-4" /> Back to Apps</Link>
      </Button>

      <div className="space-y-2 mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Submit an App</h1>
        <p className="max-w-prose text-muted-foreground">
          Announce your Nostr application by publishing a{' '}
          <span className="font-mono text-sm">kind:{APP_HANDLER_KIND}</span> NIP-89 handler event.
          This registers your app in the directory so the community can discover and rate it.
        </p>
      </div>

      {!user ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Alert><AlertCircle className="size-4" /><AlertDescription>You must be logged in to submit an app.</AlertDescription></Alert>
            <LoginArea className="max-w-60" />
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>

          {/* ── App Details ── */}
          <Card>
            <CardHeader>
              <CardTitle>App Details</CardTitle>
              <CardDescription>Basic metadata stored in the event content as kind-0-style JSON.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="app-name">Name <span className="text-destructive">*</span></Label>
                <Input id="app-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Nostr App" maxLength={100} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-about">Description <span className="text-destructive">*</span></Label>
                <Textarea id="app-about" value={about} onChange={(e) => setAbout(e.target.value)} placeholder="A short description of what your app does." rows={3} maxLength={500} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="app-picture">Logo URL <span className="text-destructive">*</span></Label>
                  <Input id="app-picture" type="url" value={picture} onChange={(e) => setPicture(e.target.value)} placeholder="https://example.com/logo.png" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="app-website">Website <span className="text-destructive">*</span></Label>
                  <Input id="app-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-nip05">NIP-05 identifier</Label>
                <Input id="app-nip05" value={nip05} onChange={(e) => setNip05(e.target.value)} placeholder="app@example.com" autoComplete="off" />
                <p className="text-xs text-muted-foreground">Optional. Used for verification.</p>
              </div>
            </CardContent>
          </Card>

          {/* ── Supported Kinds ── */}
          <Card>
            <CardHeader>
              <CardTitle>Supported Event Kinds</CardTitle>
              <CardDescription>
                The Nostr event kinds (<code>k</code> tags) your app can open or handle.
                Entering a kind will suggest related NIPs below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {kinds.map((k, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="number" min={0} value={k.value} onChange={(e) => updateKind(i, e.target.value)}
                    placeholder="e.g. 1" className="max-w-40" aria-label={`Kind ${i + 1}`} />
                  {k.value && kindToNips.has(parseInt(k.value, 10)) && (
                    <span className="text-xs text-muted-foreground">
                      → NIP-{kindToNips.get(parseInt(k.value, 10))!.join(', NIP-')}
                    </span>
                  )}
                  {kinds.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeKind(i)} aria-label="Remove kind">
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addKind}>
                <PlusCircle className="size-4" /> Add kind
              </Button>
              {suggestedNips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Inferred:</span>
                  {suggestedNips.map((num) => (
                    <button key={num} type="button"
                      onClick={() => setNipRefs((p) => [...p, { type: 'official', number: num, address: '', relayHint: '' }])}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      + NIP-{num}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Platform URLs ── */}
          <Card>
            <CardHeader>
              <CardTitle>Platform URLs</CardTitle>
              <CardDescription>
                URL templates per platform. Include <code className="rounded bg-muted px-1 text-xs">&lt;bech32&gt;</code> where the NIP-19 identifier goes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {platforms.map((p, i) => (
                <div key={i} className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {APP_PLATFORMS.map((pl) => (
                        <button key={pl} type="button" onClick={() => updatePlatform(i, { platform: pl })}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${p.platform === pl ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                          {PLATFORM_LABELS[pl]}
                        </button>
                      ))}
                    </div>
                    {platforms.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removePlatform(i)} aria-label="Remove platform">
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`platform-url-${i}`} className="text-xs">URL template</Label>
                      <Input id={`platform-url-${i}`} value={p.url} onChange={(e) => updatePlatform(i, { url: e.target.value })}
                        placeholder={`https://example.com/${p.platform === 'ios' ? 'app/<bech32>' : 'a/<bech32>'}`} className="font-mono text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`platform-hint-${i}`} className="text-xs">Entity hint <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Input id={`platform-hint-${i}`} value={p.hint} onChange={(e) => updatePlatform(i, { hint: e.target.value })}
                        placeholder="naddr, nevent, nprofile…" className="text-xs" />
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addPlatform}>
                <PlusCircle className="size-4" /> Add platform
              </Button>
            </CardContent>
          </Card>

          {/* ── NIPs ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="size-4" /> NIPs</CardTitle>
              <CardDescription>
                Nostr Implementation Possibilities this app implements. Your own custom NIPs appear
                in the list by default; search to add official or community NIPs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NipPicker nipRefs={nipRefs} setNipRefs={setNipRefs} kindToNips={kindToNips} pubkey={user.pubkey} />
            </CardContent>
          </Card>

          {/* ── Git Repos ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FolderGit2 className="size-4" /> Git Repositories</CardTitle>
              <CardDescription>
                NIP-34 repository announcements for this app's source code. Your own repos appear
                in the list by default; search to link any public repository.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RepoPicker repoRefs={repoRefs} setRepoRefs={setRepoRefs} pubkey={user.pubkey} />
            </CardContent>
          </Card>

          {/* ── Zapstore ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShoppingBag className="size-4" /> Zapstore Listing</CardTitle>
              <CardDescription>
                Link to this app's Zapstore listing (kind 32267 — NIP-82 Software Application) so
                users can find installable builds. Your own listings appear by default.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ZapstorePicker zapstoreRefs={zapstoreRefs} setZapstoreRefs={setZapstoreRefs} pubkey={user.pubkey} />
            </CardContent>
          </Card>

          {/* ── Category Tags ── */}
          <Card>
            <CardHeader>
              <CardTitle>Category Tags</CardTitle>
              <CardDescription>Hashtag categories (<code>t</code> tags) for relay-side filtering.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); setTagInput(''); } }}
                  placeholder="social, messaging, tools…" aria-label="Add a category tag" className="max-w-xs" />
                <Button type="button" variant="outline" size="sm" onClick={() => { addTag(tagInput); setTagInput(''); }}>Add</Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 pr-1">
                      {t}
                      <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))}
                        className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={`Remove ${t}`}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Press Enter or comma to add. Common: social, tools, messaging, media, marketplace, communities, zaps.</p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 pb-4">
            <Button type="button" variant="ghost" asChild><Link to="/apps">Cancel</Link></Button>
            <Button type="submit" disabled={isPending} className="gap-1.5 min-w-32">
              {isPending ? <>Publishing…</> : <><PlusCircle className="size-4" /> Publish App</>}
            </Button>
          </div>
        </form>
      )}
    </Layout>
  );
}

export default SubmitAppPage;
