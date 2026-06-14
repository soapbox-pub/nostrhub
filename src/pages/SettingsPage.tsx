import { useState } from 'react';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';
import { X, Plus, RotateCcw, Sun, Moon, Monitor } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { UserAvatar } from '@/components/UserAvatar';
import { RelayInfoCard } from '@/components/RelayInfoCard';
import { shortNpub } from '@/lib/nostr';
import { useExperts } from '@/hooks/useExperts';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useToast } from '@/hooks/useToast';
import { DEFAULT_EXPERTS, DEFAULT_COMMUNITY_CAP } from '@/lib/experts';
import { APP_RELAYS } from '@/lib/appRelays';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DittoIcon } from '@/components/icons/DittoIcon';
import { useTheme } from '@/hooks/useTheme';
import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { type Theme } from '@/contexts/AppContext';

/** Resolve a hex pubkey, npub, or nprofile string to a hex pubkey. */
function resolvePubkey(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    return null;
  }
  return null;
}

function ExpertRow({ pubkey, onRemove }: { pubkey: string; onRemove: () => void }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || author.data?.metadata?.display_name || shortNpub(pubkey);

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2">
      <UserAvatar pubkey={pubkey} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${name}`}>
        <X className="size-4" />
      </Button>
    </li>
  );
}

function ExpertsSettings() {
  const { experts, addExpert, removeExpert, setExperts } = useExperts();
  const { toast } = useToast();
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const pubkey = resolvePubkey(input);
    if (!pubkey) {
      toast({
        title: 'Invalid identifier',
        description: 'Enter a valid npub, nprofile, or 64-character hex pubkey.',
        variant: 'destructive',
      });
      return;
    }
    if (experts.includes(pubkey)) {
      toast({ title: 'Already an expert' });
      setInput('');
      return;
    }
    addExpert(pubkey);
    setInput('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nostr Experts</CardTitle>
        <CardDescription>
          Experts anchor NostrHub's trust model. Their NIP approvals rank the homepage, and their
          follow lists derive the community used to filter discussion. They appear with a{' '}
          <span className="text-primary">🎓</span> marker across the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="npub1… or hex pubkey"
            aria-label="Add an expert by npub or hex pubkey"
          />
          <Button onClick={handleAdd} className="gap-1.5 sm:w-auto">
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {experts.length > 0 ? (
          <ul className="space-y-2">
            {experts.map((pk) => (
              <ExpertRow key={pk} pubkey={pk} onRemove={() => removeExpert(pk)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No experts configured. Discussion and curation will be limited until you add some.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <p className="text-sm text-muted-foreground">{experts.length} expert(s)</p>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setExperts(DEFAULT_EXPERTS);
              toast({ title: 'Experts reset to defaults' });
            }}
          >
            <RotateCcw className="size-4" /> Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AiSettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const [baseURL, setBaseURL] = useState(config.ai.baseURL);
  const [model, setModel] = useState(config.ai.model);
  const [apiKey, setApiKey] = useState(config.ai.apiKey);

  const dirty =
    baseURL !== config.ai.baseURL || model !== config.ai.model || apiKey !== config.ai.apiKey;

  const save = () => {
    const trimmedUrl = baseURL.trim();
    if (!trimmedUrl) {
      toast({ title: 'Base URL is required', variant: 'destructive' });
      return;
    }
    try {
      // Validate it's a URL.
      new URL(trimmedUrl);
    } catch {
      toast({ title: 'Enter a valid base URL', variant: 'destructive' });
      return;
    }
    updateConfig((c) => ({
      ...c,
      ai: { baseURL: trimmedUrl, model: model.trim(), apiKey: apiKey.trim() },
    }));
    toast({ title: 'AI settings saved' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Assistant</CardTitle>
        <CardDescription>
          Start a chat message with <span className="font-mono text-foreground">@ai</span> to get a
          reply from an OpenAI-compatible model. Requests are made directly from your browser to the
          provider below. Your reply is posted by you, tagged as AI-generated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ai-base-url">Base URL</Label>
          <Input
            id="ai-base-url"
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="https://openrouter.ai/api/v1"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            The OpenAI-compatible endpoint, e.g. OpenAI, OpenRouter, or a local server.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="openai/gpt-4o-mini"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-api-key">API key</Label>
          <Input
            id="ai-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Stored locally in this browser only. Treat it as a secret on this device.
          </p>
        </div>

        <div className="flex justify-end border-t border-border/60 pt-4">
          <Button onClick={save} disabled={!dirty}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CommunitySettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const cap = config.communityCap;
  const capEnabled = cap != null;
  const [draft, setDraft] = useState(String(cap ?? DEFAULT_COMMUNITY_CAP));

  const setCap = (value: number | null) => {
    updateConfig((c) => ({ ...c, communityCap: value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Community Size</CardTitle>
        <CardDescription>
          The community is built from the experts' most-followed follows, ranked by how many experts
          follow each person, then capped. Experts and you are always included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="cap-toggle">Limit community size</Label>
            <p className="text-sm text-muted-foreground">
              Disable to include everyone followed by any expert (slower, less spam-resistant).
            </p>
          </div>
          <Switch
            id="cap-toggle"
            checked={capEnabled}
            onCheckedChange={(checked) => {
              setCap(checked ? Number(draft) || DEFAULT_COMMUNITY_CAP : null);
            }}
          />
        </div>

        {capEnabled && (
          <div className="space-y-2">
            <Label htmlFor="cap-input">Maximum community members</Label>
            <div className="flex gap-2">
              <Input
                id="cap-input"
                type="number"
                min={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="max-w-40"
              />
              <Button
                variant="outline"
                onClick={() => {
                  const n = Number(draft);
                  if (!Number.isFinite(n) || n < 1) {
                    toast({ title: 'Enter a positive number', variant: 'destructive' });
                    return;
                  }
                  setCap(Math.floor(n));
                  toast({ title: 'Community size updated' });
                }}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Normalize a relay URL: trim, require a ws:// or wss:// scheme. Returns null if invalid. */
function normalizeRelayUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const withScheme = /^wss?:\/\//i.test(value) ? value : `wss://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function RelaySettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const relays = config.relayMetadata.relays;
  const [input, setInput] = useState('');

  const setRelays = (next: { url: string; read: boolean; write: boolean }[]) => {
    updateConfig((c) => ({
      ...c,
      relayMetadata: { relays: next, updatedAt: Math.floor(Date.now() / 1000) },
    }));
  };

  const handleAdd = () => {
    const url = normalizeRelayUrl(input);
    if (!url) {
      toast({
        title: 'Invalid relay URL',
        description: 'Enter a valid relay URL, e.g. wss://relay.example.com',
        variant: 'destructive',
      });
      return;
    }
    if (relays.some((r) => r.url === url)) {
      toast({ title: 'Relay already added' });
      setInput('');
      return;
    }
    setRelays([...relays, { url, read: true, write: true }]);
    setInput('');
  };

  const removeRelay = (url: string) => {
    setRelays(relays.filter((r) => r.url !== url));
  };

  const togglePermission = (url: string, key: 'read' | 'write') => {
    setRelays(relays.map((r) => (r.url === url ? { ...r, [key]: !r[key] } : r)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relays</CardTitle>
        <CardDescription>
          The relays NostrHub reads from and publishes to. These are stored only on this device and
          are not synced from or to your Nostr relay list. Disable <span className="text-foreground">Read</span>{' '}
          to stop fetching from a relay, or <span className="text-foreground">Write</span> to stop
          publishing to it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="wss://relay.example.com"
            aria-label="Add a relay URL"
          />
          <Button onClick={handleAdd} className="gap-1.5 sm:w-auto">
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {relays.length > 0 ? (
          <ul className="space-y-2">
            {relays.map((relay) => (
              <li key={relay.url}>
                <RelayInfoCard url={relay.url} onRemove={() => removeRelay(relay.url)}>
                  <div className="mt-3 flex items-center gap-4 border-t border-border/40 pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`read-${relay.url}`}
                        checked={relay.read}
                        onCheckedChange={() => togglePermission(relay.url, 'read')}
                      />
                      <Label htmlFor={`read-${relay.url}`} className="text-xs">
                        Read
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`write-${relay.url}`}
                        checked={relay.write}
                        onCheckedChange={() => togglePermission(relay.url, 'write')}
                      />
                      <Label htmlFor={`write-${relay.url}`} className="text-xs">
                        Write
                      </Label>
                    </div>
                  </div>
                </RelayInfoCard>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No relays configured. NostrHub can't load or publish content until you add at least one.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <p className="text-sm text-muted-foreground">{relays.length} relay(s)</p>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setRelays(APP_RELAYS.relays.map((r) => ({ ...r })));
              toast({ title: 'Relays reset to defaults' });
            }}
          >
            <RotateCcw className="size-4" /> Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Editable list of relays rendered as NIP-11 info cards with an add field.
 * Used for the search and Zapstore relay lists.
 */
function RelayListSetting({
  label,
  description,
  relays,
  onChange,
  placeholder,
  inputId,
}: {
  label: string;
  description: string;
  relays: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  inputId: string;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState('');

  const add = () => {
    const url = normalizeRelayUrl(input);
    if (!url) {
      toast({ title: 'Enter a valid relay URL', variant: 'destructive' });
      return;
    }
    if (relays.includes(url)) {
      toast({ title: 'Relay already added' });
      return;
    }
    onChange([...relays, url]);
    setInput('');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <Label htmlFor={inputId}>{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {relays.length > 0 && (
        <div className="space-y-2">
          {relays.map((url) => (
            <RelayInfoCard
              key={url}
              url={url}
              onRemove={() => onChange(relays.filter((r) => r !== url))}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          id={inputId}
          type="text"
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="max-w-80"
        />
        <Button variant="outline" onClick={add}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

/** Specialized relays: NIP-50 search, NIP-45 stats, and Zapstore content. */
function SpecialRelaySettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const [statsDraft, setStatsDraft] = useState(config.statsRelay);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Specialized Relays</CardTitle>
        <CardDescription>
          Beyond your general read/write relays, NostrHub fans certain queries out to dedicated
          relays. Each relay's NIP-11 information is shown below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RelayListSetting
          label="Search relays"
          description="Relays that implement NIP-50 full-text search. Used for app, NIP, and profile search."
          relays={config.searchRelays}
          onChange={(next) => updateConfig((c) => ({ ...c, searchRelays: next }))}
          placeholder="wss://relay.example.com"
          inputId="search-relay-input"
        />

        <div className="space-y-3">
          <div className="space-y-0.5">
            <Label htmlFor="stats-relay-input">Stats relay</Label>
            <p className="text-sm text-muted-foreground">
              A relay supporting NIP-45 <code className="text-xs">COUNT</code> and the{' '}
              <code className="text-xs">distinct:author</code> search extension, used for network
              statistics and client metrics. Leave empty to disable.
            </p>
          </div>
          {config.statsRelay && <RelayInfoCard url={config.statsRelay} />}
          <div className="flex gap-2">
            <Input
              id="stats-relay-input"
              type="text"
              value={statsDraft}
              placeholder="wss://relay.example.com"
              onChange={(e) => setStatsDraft(e.target.value)}
              className="max-w-80"
            />
            <Button
              variant="outline"
              onClick={() => {
                const trimmed = statsDraft.trim();
                if (trimmed === '') {
                  updateConfig((c) => ({ ...c, statsRelay: '' }));
                  toast({ title: 'Stats relay cleared' });
                  return;
                }
                const url = normalizeRelayUrl(trimmed);
                if (!url) {
                  toast({ title: 'Enter a valid relay URL', variant: 'destructive' });
                  return;
                }
                setStatsDraft(url);
                updateConfig((c) => ({ ...c, statsRelay: url }));
                toast({ title: 'Stats relay updated' });
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { hasDittoTheme } = useActiveProfileTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Choose how NostrHub looks. The <span className="text-foreground">Ditto</span>{' '}
          option applies the theme you configured in Ditto (or any compatible client),
          and only appears once you've set one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-xs space-y-2">
          <Label htmlFor="theme-mode">Theme</Label>
          <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <SelectTrigger id="theme-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">
                <span className="flex items-center gap-2">
                  <Sun className="w-4 h-4" /> Light
                </span>
              </SelectItem>
              <SelectItem value="dark">
                <span className="flex items-center gap-2">
                  <Moon className="w-4 h-4" /> Dark
                </span>
              </SelectItem>
              <SelectItem value="system">
                <span className="flex items-center gap-2">
                  <Monitor className="w-4 h-4" /> System
                </span>
              </SelectItem>
              {hasDittoTheme && (
                <SelectItem value="ditto">
                  <span className="flex items-center gap-2">
                    <DittoIcon className="w-4 h-4" /> Ditto
                  </span>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

const SettingsPage = () => {
  useSeoMeta({
    title: 'Settings | NostrHub',
    description: 'Configure your Nostr Experts and community settings for NostrHub.',
  });

  return (
    <Layout>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Tune the trust model that powers NostrHub.</p>
      </div>
      <div className="mt-6 space-y-6">
        <AppearanceSettings />
        <ExpertsSettings />
        <CommunitySettings />
        <RelaySettings />
        <SpecialRelaySettings />
        <AiSettings />
      </div>
    </Layout>
  );
};

export default SettingsPage;
