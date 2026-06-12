import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, AlertCircle, BookOpen, FolderGit2, PlusCircle, ShoppingBag, X } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Layout } from '@/components/Layout';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useToast } from '@/hooks/useToast';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { APP_PLATFORMS, APP_HANDLER_KIND, nipGithubUrl, type AppPlatform } from '@/lib/apps';

const PLATFORM_LABELS: Record<AppPlatform, string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
  desktop: 'Desktop',
  linux: 'Linux',
  macos: 'macOS',
  windows: 'Windows',
};

/** Validate a URL string: must be http or https. */
function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validate a WebSocket URL: must be ws or wss. */
function isValidWsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'ws:' || u.protocol === 'wss:';
  } catch {
    return false;
  }
}

interface PlatformEntry {
  platform: AppPlatform;
  url: string;
  /** Optional NIP-19 entity type hint (nevent, nprofile, naddr, …). */
  hint: string;
}

interface KindEntry {
  value: string;
}

/** A referenced NIP in the form state. */
interface NipRefEntry {
  /** 'official' = by NIP number, 'custom' = by naddr coordinate. */
  type: 'official' | 'custom';
  /** NIP number string e.g. "01", "34", "7D" — only used when type='official'. */
  number: string;
  /** naddr coordinate — only used when type='custom'. */
  address: string;
  /** Relay hint for custom NIPs. */
  relayHint: string;
}

/** A referenced git repo in the form state (kind 30617 address). */
interface RepoRefEntry {
  address: string;   // "30617:<pubkey>:<d>"
  relayHint: string;
}

/** A referenced Zapstore listing in the form state (kind 32267 address). */
interface ZapstoreRefEntry {
  address: string;   // "32267:<pubkey>:<d>"
  relayHint: string;
}

function generateDTag(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Parse a NIP naddr or number entered by the user into a NipRefEntry, or null. */
function parseNipInput(raw: string): NipRefEntry | null {
  const v = raw.trim();
  if (!v) return null;

  // naddr that decodes to kind 30817
  try {
    const decoded = nip19.decode(v);
    if (decoded.type === 'naddr' && decoded.data.kind === 30817) {
      const { pubkey, identifier } = decoded.data;
      const address = `30817:${pubkey}:${identifier}`;
      return { type: 'custom', number: '', address, relayHint: decoded.data.relays?.[0] ?? '' };
    }
  } catch { /* not a valid naddr */ }

  // Plain "30817:<pubkey>:<d>" coordinate
  if (/^30817:[0-9a-f]{64}:.+$/.test(v)) {
    return { type: 'custom', number: '', address: v, relayHint: '' };
  }

  // NIP number: "01", "1", "7D", "nip-34", etc.
  const num = v.replace(/^nip-?/i, '').trim().toUpperCase();
  if (/^[0-9A-F]{1,2}$/.test(num)) {
    return { type: 'official', number: num.length === 1 ? `0${num}` : num, address: '', relayHint: '' };
  }

  return null;
}

/** Parse a repo naddr or address entered by the user, or null. */
function parseRepoInput(raw: string): RepoRefEntry | null {
  const v = raw.trim();
  if (!v) return null;

  try {
    const decoded = nip19.decode(v);
    if (decoded.type === 'naddr' && decoded.data.kind === 30617) {
      const { pubkey, identifier } = decoded.data;
      return {
        address: `30617:${pubkey}:${identifier}`,
        relayHint: decoded.data.relays?.[0] ?? '',
      };
    }
  } catch { /* not a valid naddr */ }

  if (/^30617:[0-9a-f]{64}:.+$/.test(v)) {
    return { address: v, relayHint: '' };
  }

  return null;
}

/** Parse a Zapstore naddr or address, or null. */
function parseZapstoreInput(raw: string): ZapstoreRefEntry | null {
  const v = raw.trim();
  if (!v) return null;

  try {
    const decoded = nip19.decode(v);
    if (decoded.type === 'naddr' && decoded.data.kind === 32267) {
      const { pubkey, identifier } = decoded.data;
      return {
        address: `32267:${pubkey}:${identifier}`,
        relayHint: decoded.data.relays?.[0] ?? '',
      };
    }
  } catch { /* not a valid naddr */ }

  if (/^32267:[0-9a-f]{64}:.+$/.test(v)) {
    return { address: v, relayHint: '' };
  }

  return null;
}

export function SubmitAppPage() {
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const navigate = useNavigate();
  const officialNips = useOfficialNips();

  // Metadata fields
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [picture, setPicture] = useState('');
  const [website, setWebsite] = useState('');
  const [nip05, setNip05] = useState('');

  // Supported event kinds
  const [kinds, setKinds] = useState<KindEntry[]>([{ value: '' }]);

  // Platform entries
  const [platforms, setPlatforms] = useState<PlatformEntry[]>([
    { platform: 'web', url: '', hint: '' },
  ]);

  // Hashtag categories
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // NIP references
  const [nipRefInput, setNipRefInput] = useState('');
  const [nipRefs, setNipRefs] = useState<NipRefEntry[]>([]);

  // Repo references
  const [repoRefInput, setRepoRefInput] = useState('');
  const [repoRefs, setRepoRefs] = useState<RepoRefEntry[]>([]);

  // Zapstore references
  const [zapstoreRefInput, setZapstoreRefInput] = useState('');
  const [zapstoreRefs, setZapstoreRefs] = useState<ZapstoreRefEntry[]>([]);

  useSeoMeta({
    title: 'Submit an App | NostrHub',
    description: 'Announce your Nostr application as a NIP-89 handler event so the community can discover it.',
  });

  // Build a kind → [NIP numbers] mapping from the live official NIP list.
  const kindToNips = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const nip of officialNips.data ?? []) {
      if (nip.deprecated) continue;
      for (const ek of nip.eventKinds ?? []) {
        // kind may be a range like "1630-1633"
        const rangeMatch = ek.kind.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const lo = parseInt(rangeMatch[1], 10);
          const hi = parseInt(rangeMatch[2], 10);
          for (let k = lo; k <= hi; k++) {
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

  // Suggested NIP numbers inferred from the entered kinds (deduplicated, sorted).
  const suggestedNips = useMemo(() => {
    const nums = new Set<string>();
    for (const k of kinds) {
      const n = parseInt(k.value, 10);
      if (!Number.isNaN(n)) {
        for (const nipNum of kindToNips.get(n) ?? []) {
          nums.add(nipNum);
        }
      }
    }
    // Remove ones already added
    const alreadyAdded = new Set(nipRefs.filter((r) => r.type === 'official').map((r) => r.number));
    return Array.from(nums).filter((n) => !alreadyAdded.has(n)).sort();
  }, [kinds, kindToNips, nipRefs]);

  // --- kind helpers ---
  const addKind = () => setKinds((prev) => [...prev, { value: '' }]);
  const removeKind = (i: number) => setKinds((prev) => prev.filter((_, idx) => idx !== i));
  const updateKind = (i: number, value: string) =>
    setKinds((prev) => prev.map((k, idx) => (idx === i ? { value } : k)));

  // --- platform helpers ---
  const addPlatform = () =>
    setPlatforms((prev) => [...prev, { platform: 'web', url: '', hint: '' }]);
  const removePlatform = (i: number) =>
    setPlatforms((prev) => prev.filter((_, idx) => idx !== i));
  const updatePlatform = (i: number, patch: Partial<PlatformEntry>) =>
    setPlatforms((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  // --- tag helpers ---
  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  // --- NIP ref helpers ---
  const addNipRef = (raw: string) => {
    const ref = parseNipInput(raw);
    if (!ref) {
      toast({ title: 'Invalid NIP reference', description: 'Enter a NIP number (e.g. 01, 34, 7D) or a custom NIP naddr.', variant: 'destructive' });
      return false;
    }
    const dup = nipRefs.some((r) =>
      r.type === ref.type && (ref.type === 'official' ? r.number === ref.number : r.address === ref.address),
    );
    if (dup) return false;
    setNipRefs((prev) => [...prev, ref]);
    return true;
  };
  const removeNipRef = (i: number) => setNipRefs((prev) => prev.filter((_, idx) => idx !== i));

  // --- Repo ref helpers ---
  const addRepoRef = (raw: string) => {
    const ref = parseRepoInput(raw);
    if (!ref) {
      toast({ title: 'Invalid repo reference', description: 'Enter a kind:30617 naddr or address coordinate.', variant: 'destructive' });
      return false;
    }
    if (repoRefs.some((r) => r.address === ref.address)) return false;
    setRepoRefs((prev) => [...prev, ref]);
    return true;
  };
  const removeRepoRef = (i: number) => setRepoRefs((prev) => prev.filter((_, idx) => idx !== i));

  // --- Zapstore ref helpers ---
  const addZapstoreRef = (raw: string) => {
    const ref = parseZapstoreInput(raw);
    if (!ref) {
      toast({ title: 'Invalid Zapstore reference', description: 'Enter a kind:32267 naddr or address coordinate.', variant: 'destructive' });
      return false;
    }
    if (zapstoreRefs.some((r) => r.address === ref.address)) return false;
    setZapstoreRefs((prev) => [...prev, ref]);
    return true;
  };
  const removeZapstoreRef = (i: number) => setZapstoreRefs((prev) => prev.filter((_, idx) => idx !== i));

  // --- submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({ title: 'App name is required', variant: 'destructive' });
      return;
    }
    if (!about.trim()) {
      toast({ title: 'Description is required', variant: 'destructive' });
      return;
    }
    if (!picture.trim() || !isValidUrl(picture.trim())) {
      toast({ title: 'A valid picture URL (https) is required', variant: 'destructive' });
      return;
    }
    if (!website.trim() || !isValidUrl(website.trim())) {
      toast({ title: 'A valid website URL (https) is required', variant: 'destructive' });
      return;
    }
    if (nip05.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nip05.trim())) {
      toast({ title: 'NIP-05 identifier looks invalid', variant: 'destructive' });
      return;
    }

    const parsedKinds = kinds
      .map((k) => parseInt(k.value.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0);

    if (parsedKinds.length === 0) {
      toast({ title: 'At least one supported event kind is required', variant: 'destructive' });
      return;
    }

    const validPlatforms = platforms.filter((p) => p.url.trim());
    for (const p of validPlatforms) {
      if (!isValidUrl(p.url.trim()) && !isValidWsUrl(p.url.trim())) {
        toast({
          title: `Invalid URL for ${PLATFORM_LABELS[p.platform]}`,
          description: 'Platform URLs must start with http://, https://, ws://, or wss://',
          variant: 'destructive',
        });
        return;
      }
    }

    const metadata: Record<string, string> = {
      name: name.trim(),
      about: about.trim(),
      picture: picture.trim(),
      website: website.trim(),
    };
    if (nip05.trim()) metadata.nip05 = nip05.trim();

    const eventTags: string[][] = [
      ['d', generateDTag()],
      ['alt', `NIP-89 handler: ${name.trim()}`],
    ];

    for (const k of parsedKinds) {
      eventTags.push(['k', String(k)]);
    }

    for (const p of validPlatforms) {
      const row: string[] = [p.platform, p.url.trim()];
      if (p.hint.trim()) row.push(p.hint.trim());
      eventTags.push(row);
    }

    for (const t of tags) {
      eventTags.push(['t', t]);
    }

    // NIP references
    // Official: NIP-73 URL `i` tag pointing at the canonical GitHub blob URL —
    // consistent with NIP approvals (kind 1985) and NIP forks (kind 30817).
    // Custom: plain `a` tag; the "30817:" kind prefix is unambiguous.
    for (const ref of nipRefs) {
      if (ref.type === 'official') {
        eventTags.push(['i', nipGithubUrl(ref.number)]);
      } else {
        eventTags.push(['a', ref.address, ref.relayHint]);
      }
    }

    // Repo references — plain `a` tag; "30617:" prefix is unambiguous.
    for (const ref of repoRefs) {
      eventTags.push(['a', ref.address, ref.relayHint]);
    }

    // Zapstore references — plain `a` tag; "32267:" prefix is unambiguous.
    for (const ref of zapstoreRefs) {
      eventTags.push(['a', ref.address, ref.relayHint]);
    }

    try {
      const event = await publish({
        kind: APP_HANDLER_KIND,
        content: JSON.stringify(metadata),
        tags: eventTags,
      });

      const naddr = nip19.naddrEncode({
        kind: APP_HANDLER_KIND,
        pubkey: event.pubkey,
        identifier: event.tags.find(([n]) => n === 'd')?.[1] ?? '',
      });

      toast({ title: 'App submitted successfully!' });
      navigate(`/${naddr}`);
    } catch (err) {
      toast({
        title: 'Failed to publish',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to="/apps">
          <ArrowLeft className="mr-1.5 size-4" /> Back to Apps
        </Link>
      </Button>

      <div className="space-y-2 mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Submit an App
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Announce your Nostr application by publishing a{' '}
          <span className="font-mono text-sm">kind:{APP_HANDLER_KIND}</span> NIP-89 handler event.
          This registers your app in the directory so the community can discover and rate it.
        </p>
      </div>

      {!user ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Alert>
              <AlertCircle className="size-4" />
              <AlertDescription>You must be logged in to submit an app.</AlertDescription>
            </Alert>
            <LoginArea className="max-w-60" />
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* App metadata */}
          <Card>
            <CardHeader>
              <CardTitle>App Details</CardTitle>
              <CardDescription>
                Basic metadata stored in the event content as kind-0-style JSON.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="app-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="app-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Nostr App"
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="app-about">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="app-about"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="A short description of what your app does."
                  rows={3}
                  maxLength={500}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="app-picture">
                    Logo URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="app-picture"
                    type="url"
                    value={picture}
                    onChange={(e) => setPicture(e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-website">
                    Website <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="app-website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="app-nip05">NIP-05 identifier</Label>
                <Input
                  id="app-nip05"
                  value={nip05}
                  onChange={(e) => setNip05(e.target.value)}
                  placeholder="app@example.com"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">Optional. Used for verification.</p>
              </div>
            </CardContent>
          </Card>

          {/* Supported kinds */}
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
                  <Input
                    type="number"
                    min={0}
                    value={k.value}
                    onChange={(e) => updateKind(i, e.target.value)}
                    placeholder="e.g. 1"
                    className="max-w-40"
                    aria-label={`Kind ${i + 1}`}
                  />
                  {k.value && kindToNips.has(parseInt(k.value, 10)) && (
                    <span className="text-xs text-muted-foreground">
                      → NIP-{kindToNips.get(parseInt(k.value, 10))!.join(', NIP-')}
                    </span>
                  )}
                  {kinds.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeKind(i)}
                      aria-label="Remove kind"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addKind}>
                <PlusCircle className="size-4" /> Add kind
              </Button>
            </CardContent>
          </Card>

          {/* Platform URLs */}
          <Card>
            <CardHeader>
              <CardTitle>Platform URLs</CardTitle>
              <CardDescription>
                URL templates for each platform. Include{' '}
                <code className="rounded bg-muted px-1 text-xs">&lt;bech32&gt;</code> where the
                NIP-19 identifier should be substituted. At least one platform URL is recommended.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {platforms.map((p, i) => (
                <div key={i} className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {APP_PLATFORMS.map((pl) => (
                        <button
                          key={pl}
                          type="button"
                          onClick={() => updatePlatform(i, { platform: pl })}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            p.platform === pl
                              ? 'bg-foreground text-background'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {PLATFORM_LABELS[pl]}
                        </button>
                      ))}
                    </div>
                    {platforms.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => removePlatform(i)}
                        aria-label="Remove platform"
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`platform-url-${i}`} className="text-xs">URL template</Label>
                      <Input
                        id={`platform-url-${i}`}
                        value={p.url}
                        onChange={(e) => updatePlatform(i, { url: e.target.value })}
                        placeholder={`https://example.com/${p.platform === 'ios' ? 'app/<bech32>' : 'a/<bech32>'}`}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`platform-hint-${i}`} className="text-xs">
                        Entity type hint{' '}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id={`platform-hint-${i}`}
                        value={p.hint}
                        onChange={(e) => updatePlatform(i, { hint: e.target.value })}
                        placeholder="naddr, nevent, nprofile…"
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={addPlatform}
              >
                <PlusCircle className="size-4" /> Add platform
              </Button>
            </CardContent>
          </Card>

          {/* NIP references */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4" /> NIPs
              </CardTitle>
              <CardDescription>
                NIPs this app implements or is closely related to. Enables cross-linking between
                app listings and NIP pages on NostrHub.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {nipRefs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {nipRefs.map((ref, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 pr-1 font-mono">
                      {ref.type === 'official'
                        ? `NIP-${ref.number}`
                        : `custom:${ref.address.split(':').slice(2).join(':').slice(0, 12)}…`}
                      <button
                        type="button"
                        onClick={() => removeNipRef(i)}
                        className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label={`Remove NIP reference`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Inferred NIP suggestions from entered kinds */}
              {suggestedNips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Inferred from kinds:</span>
                  {suggestedNips.map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setNipRefs((prev) => [...prev, { type: 'official', number: num, address: '', relayHint: '' }]);
                      }}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      + NIP-{num}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={nipRefInput}
                  onChange={(e) => setNipRefInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (addNipRef(nipRefInput)) setNipRefInput('');
                    }
                  }}
                  placeholder="NIP number (01, 34, 7D) or custom NIP naddr…"
                  aria-label="Add a NIP reference"
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (addNipRef(nipRefInput)) setNipRefInput('');
                  }}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter an official NIP number (e.g. <span className="font-mono">01</span>,{' '}
                <span className="font-mono">34</span>, <span className="font-mono">7D</span>) or
                a NostrHub custom NIP naddr. Inferred suggestions appear above when you enter kinds.
              </p>
            </CardContent>
          </Card>

          {/* Git repo references */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderGit2 className="size-4" /> Git Repositories
              </CardTitle>
              <CardDescription>
                NIP-34 git repository announcements (kind 30617) for this app's source code.
                Creates a bidirectional link between the app listing and the repo page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {repoRefs.length > 0 && (
                <div className="space-y-1.5">
                  {repoRefs.map((ref, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                    >
                      <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                        {ref.address}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => removeRepoRef(i)}
                        aria-label="Remove repo reference"
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={repoRefInput}
                  onChange={(e) => setRepoRefInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (addRepoRef(repoRefInput)) setRepoRefInput('');
                    }
                  }}
                  placeholder="naddr1… or 30617:<pubkey>:<identifier>"
                  aria-label="Add a git repo reference"
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (addRepoRef(repoRefInput)) setRepoRefInput('');
                  }}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste the naddr from a NostrHub repo page, or a raw{' '}
                <span className="font-mono">30617:&lt;pubkey&gt;:&lt;id&gt;</span> coordinate.
              </p>
            </CardContent>
          </Card>

          {/* Zapstore references */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="size-4" /> Zapstore Listing
              </CardTitle>
              <CardDescription>
                Link to this app's Zapstore listing (kind 32267 — NIP-82 Software Application).
                Lets users find installable builds directly from the app's NostrHub page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {zapstoreRefs.length > 0 && (
                <div className="space-y-1.5">
                  {zapstoreRefs.map((ref, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                    >
                      <ShoppingBag className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                        {ref.address}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => removeZapstoreRef(i)}
                        aria-label="Remove Zapstore reference"
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={zapstoreRefInput}
                  onChange={(e) => setZapstoreRefInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (addZapstoreRef(zapstoreRefInput)) setZapstoreRefInput('');
                    }
                  }}
                  placeholder="naddr1… or 32267:<pubkey>:<identifier>"
                  aria-label="Add a Zapstore listing reference"
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (addZapstoreRef(zapstoreRefInput)) setZapstoreRefInput('');
                  }}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste the naddr from{' '}
                <a href="https://zap.store" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  zap.store
                </a>{' '}
                or a raw <span className="font-mono">32267:&lt;pubkey&gt;:&lt;id&gt;</span> coordinate.
              </p>
            </CardContent>
          </Card>

          {/* Category tags */}
          <Card>
            <CardHeader>
              <CardTitle>Category Tags</CardTitle>
              <CardDescription>
                Hashtag categories (<code>t</code> tags) that describe your app. These are indexed
                by relays and used for filtering.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addTag(tagInput);
                      setTagInput('');
                    }
                  }}
                  placeholder="social, messaging, tools…"
                  aria-label="Add a category tag"
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    addTag(tagInput);
                    setTagInput('');
                  }}
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 pr-1">
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTag(t)}
                        className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label={`Remove tag ${t}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Press Enter or comma to add a tag. Common tags: social, tools, messaging, media,
                marketplace, communities, zaps.
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 pb-4">
            <Button type="button" variant="ghost" asChild>
              <Link to="/apps">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5 min-w-32">
              {isPending ? (
                <>Publishing…</>
              ) : (
                <>
                  <PlusCircle className="size-4" />
                  Publish App
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </Layout>
  );
}

export default SubmitAppPage;
