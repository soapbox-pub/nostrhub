import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  ArrowLeft, ArrowRight, AlertCircle, Blocks, BookOpen, Check, ChevronDown,
  FolderGit2, ImagePlus, Loader2, MonitorSmartphone, Pencil, PlusCircle,
  Rocket, Search, ShoppingBag, Sparkles, Tags, Upload, X,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Layout } from '@/components/Layout';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useNipSearch } from '@/hooks/useNipSearch';
import { useGitRepos } from '@/hooks/useGitRepos';
import { useGitRepoSearch } from '@/hooks/useGitRepoSearch';
import { useMyZapstoreApps, useZapstoreSearch } from '@/hooks/useZapstoreSearch';
import { useToast } from '@/hooks/useToast';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
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

/** Placeholder examples reflecting how each platform tag is used in the wild. */
const PLATFORM_PLACEHOLDERS: Record<AppPlatform, string> = {
  web: 'https://example.com/<bech32>',
  ios: 'myapp://<bech32> or App Store link',
  android: 'myapp://<bech32> or intent://… or Play Store link',
  desktop: 'https://example.com/download',
  linux: 'https://example.com/download',
  macos: 'https://example.com/download',
  windows: 'https://example.com/download',
};

/** Well-known event kinds people can toggle on with one tap. */
const COMMON_KINDS: Array<{ kind: number; label: string }> = [
  { kind: 1, label: 'Notes' },
  { kind: 0, label: 'Profiles' },
  { kind: 30023, label: 'Articles' },
  { kind: 20, label: 'Pictures' },
  { kind: 21, label: 'Videos' },
  { kind: 1111, label: 'Comments' },
  { kind: 9735, label: 'Zap receipts' },
  { kind: 1059, label: 'DMs (gift wrap)' },
  { kind: 9802, label: 'Highlights' },
  { kind: 30311, label: 'Live streams' },
  { kind: 30617, label: 'Git repos' },
  { kind: 31923, label: 'Calendar events' },
];

/** Friendly subset of common category tags, one tap to add. */
const SUGGESTED_TAGS = [
  'social', 'tools', 'messaging', 'media', 'music', 'video', 'pictures',
  'marketplace', 'communities', 'zaps', 'news', 'productivity', 'education',
];

interface StepDef {
  id: 'basics' | 'platforms' | 'protocol' | 'extras' | 'launch';
  label: string;
  icon: typeof Sparkles;
  title: string;
  blurb: string;
}

const STEPS: StepDef[] = [
  {
    id: 'basics', label: 'Basics', icon: Sparkles,
    title: "What's your app?",
    blurb: 'Name it, describe it, give it a face. This is what people see in the directory.',
  },
  {
    id: 'platforms', label: 'Platforms', icon: MonitorSmartphone,
    title: 'Where does it run?',
    blurb: 'Tap the platforms you ship on. We\u2019ll point each one at your website automatically.',
  },
  {
    id: 'protocol', label: 'Protocol', icon: Blocks,
    title: 'What does it speak?',
    blurb: 'Pick the event kinds your app can open. We\u2019ll suggest matching NIPs automatically.',
  },
  {
    id: 'extras', label: 'Extras', icon: Tags,
    title: 'Finishing touches',
    blurb: 'Tags help people find you. Repos and Zapstore listings are bonus points, all optional.',
  },
  {
    id: 'launch', label: 'Launch', icon: Rocket,
    title: 'Ready for liftoff',
    blurb: 'Here\u2019s how your listing will look. Happy with it? Hit publish.',
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformEntry {
  platform: AppPlatform;
  url: string;
  hint: string;
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

/**
 * Native platform handlers conventionally use custom schemes
 * ("myapp://<bech32>") or Android intent URLs ("intent://...#Intent;...;end"),
 * so any parseable URI with a scheme is acceptable.
 */
function isValidUri(value: string): boolean {
  try { new URL(value); return true; }
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
  nipRefs, setNipRefs, pubkey,
}: {
  nipRefs: NipRefEntry[];
  setNipRefs: React.Dispatch<React.SetStateAction<NipRefEntry[]>>;
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
          placeholder="Search NIPs by number or title…"
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
// Wizard chrome
// ---------------------------------------------------------------------------

function WizardProgress({
  step, maxVisited, onJump,
}: {
  step: number;
  maxVisited: number;
  onJump: (i: number) => void;
}) {
  const pct = ((step + 1) / STEPS.length) * 100;
  return (
    <div className="space-y-3">
      {/* Gradient progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar"
        aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}
        aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-nebula transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step pills */}
      <ol className="flex items-center justify-between gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isCurrent = i === step;
          const isDone = i < step;
          const reachable = i <= maxVisited;
          return (
            <li key={s.id} className="min-w-0">
              <button
                type="button"
                onClick={() => reachable && onJump(i)}
                disabled={!reachable}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent
                    ? 'bg-gradient-to-r from-primary/20 to-nebula/20 text-foreground ring-1 ring-primary/30'
                    : isDone
                      ? 'text-foreground hover:bg-muted'
                      : reachable
                        ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        : 'cursor-default text-muted-foreground/50',
                )}
              >
                {isDone ? (
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                ) : (
                  <Icon className="size-3.5" aria-hidden="true" />
                )}
                <span className="hidden truncate sm:inline">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Small inline field error. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1" role="alert">
      {message}
    </p>
  );
}

/** One-tap toggleable chip. */
function ToggleChip({
  active, onClick, children, className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'motion-safe:active:scale-95',
        active
          ? 'border-primary/50 bg-gradient-to-r from-primary/15 to-nebula/15 text-foreground shadow-sm'
          : 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
        className,
      )}
    >
      {children}
      {active && <Check className="size-3.5 text-primary" aria-hidden="true" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Logo uploader
// ---------------------------------------------------------------------------

function LogoUploader({
  picture, setPicture, error,
}: {
  picture: string;
  setPicture: (url: string) => void;
  error?: string;
}) {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'That doesn\u2019t look like an image', variant: 'destructive' });
      return;
    }
    try {
      const tags = await uploadFile(file);
      setPicture(tags[0][1]);
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const validPreview = picture && isValidUrl(picture);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          aria-label={picture ? 'Change app logo' : 'Upload app logo'}
          className={cn(
            'group relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragOver
              ? 'scale-105 border-primary bg-primary/10'
              : validPreview
                ? 'border-transparent shadow-md'
                : 'border-border hover:border-primary/50 hover:bg-muted/50',
          )}
        >
          {isUploading ? (
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          ) : validPreview ? (
            <>
              <img src={picture} alt="App logo preview" className="size-full object-cover" />
              <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Upload className="size-5 text-white" aria-hidden="true" />
              </span>
            </>
          ) : (
            <span className="flex flex-col items-center gap-1 text-muted-foreground transition-colors group-hover:text-primary">
              <ImagePlus className="size-6" aria-hidden="true" />
              <span className="text-[10px] font-medium">Logo</span>
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5 pt-1">
          <p className="text-sm text-muted-foreground">
            Drop an image or click to upload. Square works best since it shows next to your app everywhere.
          </p>
          {showUrlInput ? (
            <Input
              type="url"
              value={picture}
              onChange={(e) => setPicture(e.target.value)}
              placeholder="https://example.com/logo.png"
              aria-label="Logo URL"
              className="max-w-sm font-mono text-xs"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              …or paste an image URL instead
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <FieldError message={error} />
    </div>
  );
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

  // --- wizard state ---
  const [step, setStep] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const stepTopRef = useRef<HTMLDivElement>(null);

  // --- form state ---
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [picture, setPicture] = useState('');
  const [website, setWebsite] = useState('');
  const [nip05, setNip05] = useState('');
  const [kinds, setKinds] = useState<number[]>([]);
  const [customKind, setCustomKind] = useState('');
  const [platforms, setPlatforms] = useState<PlatformEntry[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [nipRefs, setNipRefs] = useState<NipRefEntry[]>([]);
  const [repoRefs, setRepoRefs] = useState<RepoRefEntry[]>([]);
  const [zapstoreRefs, setZapstoreRefs] = useState<ZapstoreRefEntry[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /** Platforms whose URL the user chose to edit by hand. */
  const [editingPlatforms, setEditingPlatforms] = useState<Set<AppPlatform>>(new Set());
  /** Address of the Zapstore listing the form was prefilled from, if any. */
  const [appliedZapstore, setAppliedZapstore] = useState<string | null>(null);

  const myZapstoreApps = useMyZapstoreApps(user?.pubkey);

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

  // NIP numbers inferred from the selected kinds, not yet added.
  const suggestedNips = useMemo(() => {
    const already = new Set(nipRefs.filter((r) => r.type === 'official').map((r) => r.number));
    const nums = new Set<string>();
    for (const k of kinds) {
      for (const num of kindToNips.get(k) ?? []) nums.add(num);
    }
    return Array.from(nums).filter((n) => !already.has(n)).sort();
  }, [kinds, kindToNips, nipRefs]);

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  // --- kind helpers ---
  const toggleKind = (k: number) => {
    setKinds((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k].sort((a, b) => a - b));
    clearError('kinds');
  };
  const addCustomKind = () => {
    const n = parseInt(customKind.trim(), 10);
    if (!Number.isInteger(n) || n < 0) {
      setErrors((prev) => ({ ...prev, customKind: 'Kinds are whole numbers (0 or higher).' }));
      return;
    }
    clearError('customKind');
    clearError('kinds');
    setKinds((prev) => prev.includes(n) ? prev : [...prev, n].sort((a, b) => a - b));
    setCustomKind('');
  };

  // --- platform helpers ---

  /** Website with trailing slashes stripped, or null if absent/invalid. */
  const websiteBase = useMemo(() => {
    const w = website.trim().replace(/\/+$/, '');
    return w && isValidUrl(w) ? w : null;
  }, [website]);

  /** Deep-link patterns most web apps follow; one tap fills the URL. */
  const webUrlPatterns: Array<{ label: string; url: string }> = websiteBase
    ? [
        { label: '/<bech32>', url: `${websiteBase}/<bech32>` },
        { label: '/e/<bech32>', url: `${websiteBase}/e/<bech32>` },
        { label: '/p/<bech32>', url: `${websiteBase}/p/<bech32>` },
        { label: '/a/<bech32>', url: `${websiteBase}/a/<bech32>` },
        { label: 'just my homepage', url: websiteBase },
      ]
    : [];

  /** The URI we assume for a platform: web deep-links at the root, everything else lands on the website. */
  const defaultPlatformUrl = (pl: AppPlatform, base: string | null = websiteBase): string => {
    if (!base) return '';
    return pl === 'web' ? `${base}/<bech32>` : base;
  };

  const togglePlatform = (pl: AppPlatform) => {
    setPlatforms((prev) => {
      const existing = prev.find((p) => p.platform === pl);
      if (existing) return prev.filter((p) => p.platform !== pl);
      // Assume, don't ask: prefill every platform with a sensible URI. Diverging
      // is one tap on the edit pencil.
      return [...prev, { platform: pl, url: defaultPlatformUrl(pl), hint: '' }];
    });
    setEditingPlatforms((prev) => {
      const next = new Set(prev);
      next.delete(pl);
      return next;
    });
    clearError(`platform-${pl}`);
  };
  const updatePlatform = (pl: AppPlatform, patch: Partial<PlatformEntry>) => {
    setPlatforms((prev) => prev.map((p) => p.platform === pl ? { ...p, ...patch } : p));
    clearError(`platform-${pl}`);
  };

  // --- tag helpers ---
  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t || tags.includes(t)) return;
    setTags((p) => [...p, t]);
  };
  const toggleTag = (t: string) =>
    setTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  // --- Zapstore prefill ---

  /** Map a NIP-82 `f` tag (e.g. "android-arm64-v8a", "darwin-arm64") to our platform set. */
  const platformFromFTag = (f: string): AppPlatform | null => {
    const v = f.toLowerCase();
    if (v.startsWith('android')) return 'android';
    if (v.startsWith('ios')) return 'ios';
    if (v.startsWith('darwin') || v.startsWith('macos')) return 'macos';
    if (v.startsWith('windows')) return 'windows';
    if (v.startsWith('linux')) return 'linux';
    if (v.startsWith('web')) return 'web';
    return null;
  };

  /**
   * Prefill the form from an existing kind 32267 Zapstore listing: name,
   * description, icon, website, category tags, and platforms, plus the
   * listing reference itself. Fields the listing doesn't carry are left alone.
   */
  const applyZapstoreListing = (app: ZapstoreApp) => {
    const tag = (n: string) => app.event.tags.find(([t]) => t === n)?.[1];
    const tagValues = (n: string) =>
      app.event.tags.filter(([t, v]) => t === n && v).map(([, v]) => v);

    setName(tag('name') ?? app.identifier);

    const summary = tag('summary') || app.event.content.trim();
    if (summary) setAbout(summary.slice(0, 500));

    const icon = tag('icon');
    if (icon && isValidUrl(icon)) setPicture(icon);

    const url = tag('url') ?? tag('website');
    if (url && isValidUrl(url)) setWebsite(url.trim());
    const listingBase = url && isValidUrl(url.trim()) ? url.trim().replace(/\/+$/, '') : websiteBase;

    const listingTags = tagValues('t')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);
    if (listingTags.length > 0) {
      setTags((prev) => Array.from(new Set([...prev, ...listingTags])));
    }

    const listingPlatforms = Array.from(
      new Set(tagValues('f').map(platformFromFTag).filter((p): p is AppPlatform => p !== null)),
    );
    if (listingPlatforms.length > 0) {
      setPlatforms((prev) => {
        const next = [...prev];
        for (const pl of listingPlatforms) {
          if (!next.some((p) => p.platform === pl)) {
            next.push({ platform: pl, url: defaultPlatformUrl(pl, listingBase), hint: '' });
          }
        }
        return next;
      });
    }

    // Link the listing itself, swapping out a previously applied one.
    setZapstoreRefs((prev) => {
      const kept = prev.filter((r) => r.address !== appliedZapstore && r.address !== app.address);
      return [...kept, { address: app.address, relayHint: '', name: app.name }];
    });
    setAppliedZapstore(app.address);
    setErrors({});
    toast({ title: `Prefilled from ${app.name}`, description: 'Look it over and tweak anything you like.' });
  };

  // --- step validation ---
  const validateStep = (i: number): boolean => {
    const next: Record<string, string> = {};
    if (STEPS[i].id === 'basics') {
      if (!name.trim()) next.name = 'Give your app a name. It\u2019s the first thing people see.';
      if (!about.trim()) next.about = 'A one-or-two sentence description helps people get it instantly.';
      if (!picture.trim()) next.picture = 'Every great app needs a face. Upload a logo or paste a URL.';
      else if (!isValidUrl(picture.trim())) next.picture = 'That logo URL doesn\u2019t look right. It needs to start with https://';
      if (!website.trim()) next.website = 'Where can people learn more? A website URL is required.';
      else if (!isValidUrl(website.trim())) next.website = 'That URL doesn\u2019t look right. It needs to start with https://';
      if (nip05.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nip05.trim())) {
        next.nip05 = 'NIP-05 identifiers look like name@domain.com';
      }
    } else if (STEPS[i].id === 'platforms') {
      for (const p of platforms) {
        const url = p.url.trim();
        if (!url) continue;
        if (p.platform === 'web') {
          if (!isValidUrl(url) && !isValidWsUrl(url)) {
            next[`platform-${p.platform}`] = 'Needs to start with http://, https://, ws://, or wss://';
          }
        } else if (!isValidUri(url)) {
          next[`platform-${p.platform}`] = 'Needs to be a URL or URI with a scheme, like https://… or myapp://…';
        }
      }
    } else if (STEPS[i].id === 'protocol') {
      if (kinds.length === 0) next.kinds = 'Pick at least one event kind so clients know what your app handles.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goToStep = (i: number) => {
    setStep(i);
    setMaxVisited((m) => Math.max(m, i));
    setErrors({});
    // Bring the wizard back into view without yanking the whole page around.
    stepTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    goToStep(Math.min(step + 1, STEPS.length - 1));
  };
  const handleBack = () => goToStep(Math.max(step - 1, 0));

  // --- submit ---
  const handlePublish = async () => {
    // Safety net: re-validate everything before publishing.
    for (let i = 0; i < STEPS.length - 1; i++) {
      if (!validateStep(i)) {
        goToStep(i);
        toast({ title: 'Almost there!', description: 'A couple of fields need attention first.' });
        return;
      }
    }

    const metadata: Record<string, string> = { name: name.trim(), about: about.trim(), picture: picture.trim(), website: website.trim() };
    if (nip05.trim()) metadata.nip05 = nip05.trim();

    const eventTags: string[][] = [
      ['d', generateDTag()],
      ['alt', `NIP-89 handler: ${name.trim()}`],
    ];

    for (const k of kinds) eventTags.push(['k', String(k)]);
    for (const p of platforms) {
      if (!p.url.trim()) continue;
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
      toast({ title: '🚀 Your app is live!', description: 'Welcome to the directory.' });
      navigate(`/${naddr}`);
    } catch (err) {
      toast({ title: 'Failed to publish', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const current = STEPS[step];
  const validLogo = picture && isValidUrl(picture);

  return (
    <Layout>
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" asChild className="mb-4 -ml-2">
          <Link to="/apps"><ArrowLeft className="mr-1.5 size-4" /> Back to Apps</Link>
        </Button>

        <div ref={stepTopRef} className="scroll-mt-24 space-y-2 mb-6">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Submit <span className="text-cosmic">your app</span>
          </h1>
          <p className="max-w-prose text-muted-foreground">
            Five quick steps and your app joins the directory, published to Nostr itself as a{' '}
            <span className="font-mono text-sm">kind:{APP_HANDLER_KIND}</span> event.
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
          <div className="space-y-6">
            <WizardProgress step={step} maxVisited={maxVisited} onJump={goToStep} />

            {/* Step heading + body — keyed so each step animates in fresh */}
            <div
              key={current.id}
              className="space-y-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
            >
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{current.title}</h2>
                <p className="text-sm text-muted-foreground">{current.blurb}</p>
              </div>

              <Card className="border-border/70 bg-card/60 backdrop-blur-sm">
                <CardContent className="space-y-6 pt-6">

                  {/* ─────────────────── Step 1: Basics ─────────────────── */}
                  {current.id === 'basics' && (
                    <>
                      {(myZapstoreApps.data?.length ?? 0) > 0 && (
                        <div className="space-y-2 rounded-lg border border-nebula/30 bg-nebula/5 p-3 motion-safe:animate-in motion-safe:fade-in">
                          <p className="text-xs font-medium">
                            <ShoppingBag className="mr-1 inline size-3.5 text-nebula" aria-hidden="true" />
                            Already on Zapstore? Start from a listing and we'll fill in the basics:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {myZapstoreApps.data!.slice(0, 6).map((app) => (
                              <button
                                key={app.address}
                                type="button"
                                onClick={() => applyZapstoreListing(app)}
                                aria-pressed={appliedZapstore === app.address}
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all motion-safe:active:scale-95',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                  appliedZapstore === app.address
                                    ? 'border-nebula/50 bg-nebula/15 text-foreground'
                                    : 'border-border/60 bg-background/60 text-muted-foreground hover:border-nebula/40 hover:text-foreground',
                                )}
                              >
                                {app.icon ? (
                                  <img src={app.icon} alt="" className="size-4 rounded object-cover" />
                                ) : (
                                  <ShoppingBag className="size-3" aria-hidden="true" />
                                )}
                                {app.name}
                                {appliedZapstore === app.address && <Check className="size-3 text-nebula" aria-hidden="true" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <LogoUploader
                        picture={picture}
                        setPicture={(url) => { setPicture(url); clearError('picture'); }}
                        error={errors.picture}
                      />
                      <div className="space-y-2">
                        <Label htmlFor="app-name">Name</Label>
                        <Input
                          id="app-name" value={name}
                          onChange={(e) => { setName(e.target.value); clearError('name'); }}
                          placeholder="My Nostr App" maxLength={100}
                          aria-invalid={!!errors.name}
                          className="text-base font-medium"
                        />
                        <FieldError message={errors.name} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                          <Label htmlFor="app-about">What does it do?</Label>
                          <span className={cn('text-xs tabular-nums', about.length > 450 ? 'text-destructive' : 'text-muted-foreground/60')}>
                            {about.length}/500
                          </span>
                        </div>
                        <Textarea
                          id="app-about" value={about}
                          onChange={(e) => { setAbout(e.target.value); clearError('about'); }}
                          placeholder="The coziest way to read long-form articles on Nostr."
                          rows={3} maxLength={500}
                          aria-invalid={!!errors.about}
                        />
                        <FieldError message={errors.about} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="app-website">Website</Label>
                        <Input
                          id="app-website" type="url" value={website}
                          onChange={(e) => { setWebsite(e.target.value); clearError('website'); }}
                          placeholder="https://example.com"
                          aria-invalid={!!errors.website}
                        />
                        <FieldError message={errors.website} />
                      </div>
                      <Collapsible open={advancedOpen || !!errors.nip05} onOpenChange={setAdvancedOpen}>
                        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                          <ChevronDown
                            className={cn('size-4 transition-transform', (advancedOpen || !!errors.nip05) && 'rotate-180')}
                            aria-hidden="true"
                          />
                          Advanced
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <div className="space-y-2">
                            <Label htmlFor="app-nip05">
                              NIP-05 <span className="font-normal text-muted-foreground">(optional)</span>
                            </Label>
                            <Input
                              id="app-nip05" value={nip05}
                              onChange={(e) => { setNip05(e.target.value); clearError('nip05'); }}
                              placeholder="app@example.com" autoComplete="off"
                              aria-invalid={!!errors.nip05}
                            />
                            <p className="text-xs text-muted-foreground">Used for verification, like a profile's NIP-05.</p>
                            <FieldError message={errors.nip05} />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  )}

                  {/* ────────────────── Step 2: Platforms ────────────────── */}
                  {current.id === 'platforms' && (
                    <>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Select platforms">
                        {APP_PLATFORMS.map((pl) => (
                          <ToggleChip
                            key={pl}
                            active={platforms.some((p) => p.platform === pl)}
                            onClick={() => togglePlatform(pl)}
                          >
                            {PLATFORM_LABELS[pl]}
                          </ToggleChip>
                        ))}
                      </div>

                      {platforms.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                          Nothing selected, and that's fine! You can add platform links later by editing your listing.
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-border/60">
                          {platforms.map((p, i) => {
                            const isEditing = editingPlatforms.has(p.platform) || !!errors[`platform-${p.platform}`] || !p.url;
                            return (
                              <div
                                key={p.platform}
                                className={cn(
                                  'space-y-2 px-3 py-2.5 motion-safe:animate-in motion-safe:fade-in',
                                  i > 0 && 'border-t border-border/40',
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {PLATFORM_LABELS[p.platform]}
                                  </span>
                                  {isEditing ? (
                                    <Input
                                      id={`platform-url-${p.platform}`}
                                      value={p.url}
                                      onChange={(e) => updatePlatform(p.platform, { url: e.target.value })}
                                      placeholder={PLATFORM_PLACEHOLDERS[p.platform]}
                                      aria-invalid={!!errors[`platform-${p.platform}`]}
                                      aria-label={`${PLATFORM_LABELS[p.platform]} URL`}
                                      className="h-8 flex-1 font-mono text-xs"
                                      autoFocus={editingPlatforms.has(p.platform)}
                                    />
                                  ) : (
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                                      {p.url}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditingPlatforms((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(p.platform)) next.delete(p.platform);
                                      else next.add(p.platform);
                                      return next;
                                    })}
                                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    aria-label={isEditing ? `Done editing ${PLATFORM_LABELS[p.platform]} URL` : `Edit ${PLATFORM_LABELS[p.platform]} URL`}
                                  >
                                    {isEditing ? <Check className="size-3.5" aria-hidden="true" /> : <Pencil className="size-3.5" aria-hidden="true" />}
                                  </button>
                                </div>
                                {isEditing && p.platform === 'web' && webUrlPatterns.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 pl-23">
                                    {webUrlPatterns.map(({ label, url }) => (
                                      <button
                                        key={label}
                                        type="button"
                                        onClick={() => updatePlatform('web', { url })}
                                        aria-pressed={p.url === url}
                                        className={cn(
                                          'rounded-full px-2 py-0.5 font-mono text-[11px] font-medium transition-all motion-safe:active:scale-95',
                                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                          p.url === url
                                            ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                                            : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary',
                                        )}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <FieldError message={errors[`platform-${p.platform}`]} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {platforms.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          We point these at your website automatically. <code className="rounded bg-muted px-1">&lt;bech32&gt;</code> is
                          where clients drop the event identifier when deep-linking. Tap the pencil if yours works differently.
                        </p>
                      )}
                    </>
                  )}

                  {/* ────────────────── Step 3: Protocol ────────────────── */}
                  {current.id === 'protocol' && (
                    <>
                      <div className="space-y-3">
                        <Label className="text-sm">Event kinds your app can open</Label>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Select event kinds">
                          {COMMON_KINDS.map(({ kind, label }) => (
                            <ToggleChip key={kind} active={kinds.includes(kind)} onClick={() => toggleKind(kind)}>
                              <span className="font-mono text-xs text-muted-foreground">{kind}</span>
                              {label}
                            </ToggleChip>
                          ))}
                        </div>
                        {/* Custom kinds the user added that aren't in the preset list */}
                        {kinds.filter((k) => !COMMON_KINDS.some((c) => c.kind === k)).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {kinds.filter((k) => !COMMON_KINDS.some((c) => c.kind === k)).map((k) => (
                              <Badge key={k} variant="secondary" className="gap-1 pr-1 font-mono text-xs">
                                kind {k}
                                {kindToNips.has(k) && (
                                  <span className="font-sans text-muted-foreground">· NIP-{kindToNips.get(k)![0]}</span>
                                )}
                                <button
                                  type="button" onClick={() => toggleKind(k)}
                                  className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  aria-label={`Remove kind ${k}`}
                                >
                                  <X className="size-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Input
                            type="number" min={0} value={customKind}
                            onChange={(e) => { setCustomKind(e.target.value); clearError('customKind'); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomKind(); } }}
                            placeholder="Other kind…" className="max-w-36"
                            aria-label="Add a custom event kind"
                          />
                          <Button type="button" variant="outline" size="sm" onClick={addCustomKind} className="gap-1">
                            <PlusCircle className="size-3.5" /> Add
                          </Button>
                        </div>
                        <FieldError message={errors.customKind} />
                        <FieldError message={errors.kinds} />
                      </div>

                      {suggestedNips.length > 0 && (
                        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 motion-safe:animate-in motion-safe:fade-in">
                          <p className="text-xs font-medium text-foreground">
                            <Sparkles className="mr-1 inline size-3.5 text-primary" aria-hidden="true" />
                            Based on your kinds, your app probably implements these NIPs. Tap to add:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {suggestedNips.map((num) => (
                              <button
                                key={num} type="button"
                                onClick={() => setNipRefs((p) => [...p, { type: 'official', number: num, address: '', relayHint: '' }])}
                                className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-xs font-medium text-primary transition-all hover:bg-primary/20 motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                + NIP-{num}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label className="text-sm">NIPs this app implements <span className="font-normal text-muted-foreground">(optional)</span></Label>
                        <NipPicker nipRefs={nipRefs} setNipRefs={setNipRefs} pubkey={user.pubkey} />
                      </div>
                    </>
                  )}

                  {/* ─────────────────── Step 4: Extras ─────────────────── */}
                  {current.id === 'extras' && (
                    <>
                      <div className="space-y-3">
                        <Label className="text-sm">Category tags</Label>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested category tags">
                          {SUGGESTED_TAGS.map((t) => (
                            <ToggleChip key={t} active={tags.includes(t)} onClick={() => toggleTag(t)} className="px-2.5 py-1 text-xs">
                              {t}
                            </ToggleChip>
                          ))}
                        </div>
                        {tags.filter((t) => !SUGGESTED_TAGS.includes(t)).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {tags.filter((t) => !SUGGESTED_TAGS.includes(t)).map((t) => (
                              <Badge key={t} variant="secondary" className="gap-1 pr-1">
                                {t}
                                <button
                                  type="button" onClick={() => toggleTag(t)}
                                  className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  aria-label={`Remove ${t}`}
                                >
                                  <X className="size-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); setTagInput(''); } }}
                            placeholder="Your own tag…" aria-label="Add a category tag" className="max-w-48"
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => { addTag(tagInput); setTagInput(''); }}>Add</Button>
                        </div>
                      </div>

                      <Accordion type="multiple" className="w-full">
                        <AccordionItem value="repos">
                          <AccordionTrigger className="text-sm hover:no-underline">
                            <span className="flex items-center gap-2">
                              <FolderGit2 className="size-4 text-muted-foreground" aria-hidden="true" />
                              Link source code
                              {repoRefs.length > 0 && <Badge variant="secondary" className="text-xs">{repoRefs.length}</Badge>}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <RepoPicker repoRefs={repoRefs} setRepoRefs={setRepoRefs} pubkey={user.pubkey} />
                          </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="zapstore">
                          <AccordionTrigger className="text-sm hover:no-underline">
                            <span className="flex items-center gap-2">
                              <ShoppingBag className="size-4 text-muted-foreground" aria-hidden="true" />
                              Link a Zapstore listing
                              {zapstoreRefs.length > 0 && <Badge variant="secondary" className="text-xs">{zapstoreRefs.length}</Badge>}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <ZapstorePicker zapstoreRefs={zapstoreRefs} setZapstoreRefs={setZapstoreRefs} pubkey={user.pubkey} />
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </>
                  )}

                  {/* ─────────────────── Step 5: Launch ─────────────────── */}
                  {current.id === 'launch' && (
                    <>
                      {/* Directory-style preview */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Your directory listing
                        </p>
                        <div className="flex items-center overflow-hidden rounded-xl border border-border/70 bg-card/60 shadow-sm backdrop-blur-sm">
                          <div className="w-1 shrink-0 self-stretch bg-gradient-to-b from-primary to-nebula" />
                          <span className="my-2.5 ml-3 grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/60 bg-muted/40 sm:size-14">
                            {validLogo ? (
                              <img src={picture} alt="" className="size-full object-cover" />
                            ) : (
                              <Blocks className="size-5 text-muted-foreground" aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1 px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold tracking-tight sm:text-base">{name || 'Your app'}</span>
                              {platforms.length > 0 && (
                                <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                                  {platforms.map((p) => p.platform).join(' / ')}
                                </span>
                              )}
                            </div>
                            {about && <p className="mt-0.5 truncate text-xs text-muted-foreground">{about}</p>}
                            {nip05 && <p className="mt-0.5 truncate text-xs text-muted-foreground/60">{nip05}</p>}
                          </div>
                        </div>
                      </div>

                      {/* Summary rows */}
                      <div className="divide-y divide-border/40 rounded-lg border border-border/60">
                        {([
                          { label: 'Kinds', icon: Blocks, value: kinds.length ? kinds.map((k) => String(k)).join(', ') : 'None yet', target: 2 },
                          { label: 'NIPs', icon: BookOpen, value: nipRefs.length ? nipRefs.map((r) => r.type === 'official' ? `NIP-${r.number}` : 'custom').join(', ') : 'None linked', target: 2 },
                          { label: 'Platforms', icon: MonitorSmartphone, value: platforms.length ? platforms.map((p) => PLATFORM_LABELS[p.platform]).join(', ') : 'None linked', target: 1 },
                          { label: 'Tags', icon: Tags, value: tags.length ? tags.join(', ') : 'None', target: 3 },
                          { label: 'Repos', icon: FolderGit2, value: repoRefs.length ? repoRefs.map((r) => r.name).join(', ') : 'None linked', target: 3 },
                          { label: 'Zapstore', icon: ShoppingBag, value: zapstoreRefs.length ? zapstoreRefs.map((r) => r.name).join(', ') : 'None linked', target: 3 },
                        ] as const).map((row) => (
                          <div key={row.label} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                            <row.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="w-20 shrink-0 font-medium">{row.label}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.value}</span>
                            <button
                              type="button"
                              onClick={() => goToStep(row.target)}
                              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Edit ${row.label.toLowerCase()}`}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Publishing signs a <span className="font-mono">kind:{APP_HANDLER_KIND}</span> NIP-89 event
                        with your key and sends it to your relays. You can update or replace it any time.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-3 pb-4">
                {step === 0 ? (
                  <Button type="button" variant="ghost" asChild>
                    <Link to="/apps">Cancel</Link>
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={handleBack} className="gap-1.5">
                    <ArrowLeft className="size-4" aria-hidden="true" /> Back
                  </Button>
                )}

                {current.id === 'launch' ? (
                  <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={isPending}
                    size="lg"
                    className="min-w-44 gap-2 bg-gradient-to-r from-primary to-nebula text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg motion-safe:active:scale-95"
                  >
                    {isPending
                      ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Launching…</>
                      : <><Rocket className="size-4" aria-hidden="true" /> Publish app</>}
                  </Button>
                ) : (
                  <Button type="button" onClick={handleNext} className="min-w-32 gap-1.5">
                    Continue <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default SubmitAppPage;
