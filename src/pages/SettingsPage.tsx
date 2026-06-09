import { useState } from 'react';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';
import { X, Plus, RotateCcw } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { useExperts } from '@/hooks/useExperts';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useToast } from '@/hooks/useToast';
import { DEFAULT_EXPERTS, DEFAULT_COMMUNITY_CAP } from '@/lib/experts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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
      <UserAvatar pubkey={pubkey} showExpertBadge={false} />
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
        <ExpertsSettings />
        <CommunitySettings />
      </div>
    </Layout>
  );
};

export default SettingsPage;
