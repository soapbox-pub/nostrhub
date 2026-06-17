import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Globe,
  Info,
  Link2,
  Loader2,
  Plus,
  Save,
  Send,
  Server,
  Tags,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMirrorRepo } from '@/hooks/useMirrorRepo';
import { useCreateRepo } from '@/hooks/useCreateRepo';
import { usePublishRepo } from '@/hooks/usePublishRepo';
import { useGitRepo } from '@/hooks/useGitRepo';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { slugify } from '@/lib/nips';
import {
  repoNaddr,
  graspCloneUrl,
  DEFAULT_GRASP_SERVERS,
  GIT_REPO_KIND,
} from '@/lib/git';
import { cloneRepoSnapshot, findReadme, looksBinary } from '@/lib/repoBrowser';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type RepoMode = 'create' | 'existing';

/** Topic suggestions, one tap to add. */
const SUGGESTED_TOPICS = ['nostr', 'bitcoin', 'lightning', 'client', 'library', 'tools', 'web', 'cli'];

/** Friendly host label for a GRASP relay URL. */
function graspHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isHttpsOrNostr(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'nostr:';
  } catch {
    return false;
  }
}

function isWsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'wss:' || u.protocol === 'ws:';
  } catch {
    return false;
  }
}

/** Suggest a repo name from a git clone URL. */
function nameFromUrl(url: string): string | undefined {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return last.replace(/\.git$/, '') || undefined;
  } catch {
    return undefined;
  }
}

/** Pull a title (first `# heading`) and lead paragraph out of a README. */
function metaFromReadme(text: string): { title?: string; description?: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const titleLine = lines.find((l) => /^#\s+/.test(l));
  const title = titleLine?.replace(/^#\s+/, '').trim();

  // First non-empty, non-heading, non-badge line becomes the description.
  const descLine = lines.find(
    (l) => l.trim() && !/^#{1,6}\s/.test(l) && !/^[![]/.test(l.trim()) && !/^[-=*_]{3,}$/.test(l.trim()),
  );
  const description = descLine
    ?.trim()
    .replace(/^[*_`>\s]+/, '')
    .replace(/[*_`]+$/, '')
    .slice(0, 280);

  return { title, description: description || undefined };
}

/* ——— Small field helpers ——— */

/** A selectable card for choosing the repo-add path (create vs. existing). */
function ModeCard({
  active, onClick, icon: Icon, title, blurb,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary/50 bg-gradient-to-br from-primary/10 to-nebula/5 shadow-sm'
          : 'border-border/60 bg-card/40 hover:border-primary/30',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
          active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold tracking-tight">
          {title}
          {active && <Check className="size-3.5 text-primary" aria-hidden="true" />}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>
      </span>
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-destructive" role="alert">
      {message}
    </p>
  );
}

function RemovableChip({ value, onRemove }: { value: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="max-w-full gap-1 rounded-md font-mono text-xs font-normal">
      <span className="truncate">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${value}`}
        className="rounded-full text-muted-foreground hover:text-destructive"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}

/** An input + add button that accumulates a list of values (URLs, etc.). */
function ListInput({
  id,
  placeholder,
  values,
  onChange,
  validate,
  error,
}: {
  id?: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  validate?: (value: string) => boolean;
  error?: string;
}) {
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string>();

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (validate && !validate(v)) {
      setLocalError('That doesn’t look like a valid URL.');
      return;
    }
    if (!values.includes(v)) onChange([...values, v]);
    setDraft('');
    setLocalError(undefined);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setLocalError(undefined); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          aria-invalid={!!localError}
          className="font-mono text-sm"
        />
        <Button type="button" variant="outline" size="icon" onClick={add} aria-label="Add">
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <FieldError message={localError ?? error} />
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <RemovableChip key={v} value={v} onRemove={() => onChange(values.filter((x) => x !== v))} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ——— Page ——— */

const AddRepoPage = () => {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { config } = useAppContext();

  // --- edit mode (route: /repos/edit/:naddr) ---
  const { naddr: editNaddr } = useParams<{ naddr: string }>();
  const isEditMode = Boolean(editNaddr);

  /** Decoded pubkey + identifier of the repo being edited, or null if invalid. */
  const editTarget = useMemo(() => {
    if (!editNaddr) return null;
    try {
      const decoded = nip19.decode(editNaddr);
      if (decoded.type !== 'naddr' || decoded.data.kind !== GIT_REPO_KIND) return null;
      return {
        pubkey: decoded.data.pubkey,
        identifier: decoded.data.identifier,
        relays: decoded.data.relays,
      };
    } catch {
      return null;
    }
  }, [editNaddr]);

  const existingRepo = useGitRepo({
    pubkey: editTarget?.pubkey ?? '',
    identifier: editTarget?.identifier ?? '',
    relays: editTarget?.relays,
  });

  const [mode, setMode] = useState<RepoMode>('create');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [webUrls, setWebUrls] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);

  // 'create' mode: GRASP servers (editable, seeded with the defaults).
  const [graspServers, setGraspServers] = useState<string[]>([...DEFAULT_GRASP_SERVERS]);
  const [selectedGrasp, setSelectedGrasp] = useState<string[]>([...DEFAULT_GRASP_SERVERS]);
  const [showGraspInput, setShowGraspInput] = useState(false);
  const [graspDraft, setGraspDraft] = useState('');

  // 'existing' mode: progressive disclosure driven by a clone-URL probe.
  const [existingUrl, setExistingUrl] = useState('');
  const [existingRevealed, setExistingRevealed] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  const { mutateAsync: mirrorRepo, isPending: isMirroring } = useMirrorRepo();
  const { mutateAsync: createRepo, isPending: isCreating } = useCreateRepo();
  const { mutateAsync: publishRepo, isPending: isSaving } = usePublishRepo();
  const isPending = isMirroring || isCreating || isSaving;

  // Prefill the form from the existing announcement when editing. Keyed to the
  // loaded event id so it runs once per revision, not on every render.
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);
  const existingAnnouncement = existingRepo.data?.repo;
  if (isEditMode && existingAnnouncement && prefilledFrom !== existingAnnouncement.event.id) {
    setPrefilledFrom(existingAnnouncement.event.id);
    setName(existingAnnouncement.name);
    setIdentifier(existingAnnouncement.identifier);
    setIdentifierTouched(true);
    setDescription(existingAnnouncement.description ?? '');
    setWebUrls(existingAnnouncement.webUrls);
    setHashtags(existingAnnouncement.hashtags);
  }

  useSeoMeta({
    title: isEditMode ? 'Edit repository | NostrHub' : 'Add a repository | NostrHub',
    description: 'Create a fresh git repository on Nostr, or announce an existing one.',
  });

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const handleNameChange = (value: string) => {
    setName(value);
    clearError('name');
    if (!identifierTouched) setIdentifier(slugify(value));
  };

  const handleIdentifierChange = (value: string) => {
    setIdentifierTouched(true);
    setIdentifier(slugify(value));
  };

  /**
   * Probe an existing repo by shallow-cloning it: derive its name/description
   * from the README and reveal the rest of the form. Falls back to the URL
   * path for the name if the clone can't be reached (CORS, private, etc.).
   */
  const handleProbeExisting = async () => {
    const url = existingUrl.trim();
    if (!url) return;
    clearError('cloneUrls');

    if (!isHttpsOrNostr(url)) {
      setErrors((p) => ({ ...p, cloneUrls: 'Enter an https:// or nostr:// clone URL.' }));
      return;
    }

    const urlName = nameFromUrl(url);
    if (urlName && !name) handleNameChange(urlName);

    // nostr:// URLs can't be cloned over plain HTTP here; just reveal the form.
    if (url.startsWith('nostr://')) {
      setExistingRevealed(true);
      return;
    }

    setIsCloning(true);
    try {
      const snapshot = await cloneRepoSnapshot({
        cloneUrls: [url],
        corsProxy: config.gitCorsProxy,
        signal: AbortSignal.timeout(20000),
      });
      const readme = findReadme(snapshot.tree);
      if (readme) {
        const bytes = await snapshot.readFile(readme.path);
        if (!looksBinary(bytes)) {
          const { title, description: desc } = metaFromReadme(new TextDecoder().decode(bytes));
          if (title && (!name || name === urlName)) handleNameChange(title);
          if (desc && !description) setDescription(desc);
        }
      }
      toast({ title: 'Repository found', description: 'Filled in what we could from the README.' });
    } catch {
      // Couldn't clone (CORS / private / unreachable) — proceed with the URL name.
      toast({
        title: "Couldn't read the repository",
        description: 'Using the name from the URL. You can fill in the rest by hand.',
      });
    } finally {
      setIsCloning(false);
      setExistingRevealed(true);
    }
  };

  const toggleGrasp = (url: string) => {
    setSelectedGrasp((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
    clearError('grasp');
  };

  /** Add a custom GRASP server to the list (and select it). */
  const addGrasp = () => {
    const url = graspDraft.trim();
    if (!url) return;
    let normalized: string;
    try {
      normalized = new URL(url).href;
    } catch {
      setErrors((p) => ({ ...p, graspInput: 'Enter a valid wss:// relay URL.' }));
      return;
    }
    if (!isWsUrl(normalized)) {
      setErrors((p) => ({ ...p, graspInput: 'GRASP servers use a wss:// (relay) URL.' }));
      return;
    }
    clearError('graspInput');
    setGraspServers((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setSelectedGrasp((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setGraspDraft('');
    setShowGraspInput(false);
  };

  const toggleTopic = (t: string) =>
    setHashtags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Give your repository a name.';
    if (!isEditMode && selectedGrasp.length === 0) {
      next.grasp = 'Pick at least one GRASP server to host the repository.';
    }
    if (!isEditMode && mode === 'existing' && !existingUrl.trim()) {
      next.cloneUrls = 'A source clone URL is required.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !validate()) return;
    const id = identifier.trim() || slugify(name);

    // Edit mode: republish the announcement, preserving the immutable bits
    // (clone URLs, relays, earliest-commit fingerprint) of the original.
    if (isEditMode) {
      if (!existingAnnouncement) return;
      try {
        await publishRepo({
          identifier: existingAnnouncement.identifier,
          name: name.trim(),
          description: description.trim() || undefined,
          cloneUrls: existingAnnouncement.cloneUrls,
          relays: existingAnnouncement.relays,
          hashtags,
          webUrls,
          earliestCommit: existingAnnouncement.earliestCommit,
        });
        toast({ title: 'Repository updated' });
        navigate(`/${repoNaddr(user.pubkey, existingAnnouncement.identifier, existingAnnouncement.relays)}`);
      } catch (error) {
        toast({
          title: 'Failed to update repository',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      }
      return;
    }

    try {
      if (mode === 'create') {
        await createRepo({
          identifier: id,
          name: name.trim(),
          description: description.trim() || undefined,
          graspServers: selectedGrasp,
          hashtags,
          webUrls,
        });
        toast({ title: 'Repository created', description: 'Pushed to Nostr and announced.' });
      } else {
        await mirrorRepo({
          identifier: id,
          name: name.trim(),
          description: description.trim() || undefined,
          sourceUrl: existingUrl.trim(),
          graspServers: selectedGrasp,
          hashtags,
          webUrls,
        });
        toast({ title: 'Repository mirrored', description: 'Cloned to Nostr and announced.' });
      }
      navigate(`/${repoNaddr(user.pubkey, id, selectedGrasp)}`);
    } catch (error) {
      toast({
        title: mode === 'create' ? 'Failed to create repository' : 'Failed to mirror repository',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  /** Why the edit form can't be shown yet (or at all), if anything. */
  const editGuard: 'invalid' | 'loading' | 'missing' | 'forbidden' | null = !isEditMode
    ? null
    : !editTarget
      ? 'invalid'
      : user && user.pubkey !== editTarget.pubkey
        ? 'forbidden'
        : existingRepo.isLoading
          ? 'loading'
          : !existingAnnouncement
            ? 'missing'
            : null;

  const backTo = isEditMode && editTarget ? `/${editNaddr}` : '/repos';
  const backLabel = isEditMode ? 'Back to repository' : 'Back to Repositories';

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to={backTo}><ArrowLeft className="mr-1.5 size-4" /> {backLabel}</Link>
      </Button>

      <div className="mb-6 space-y-2">
        {isEditMode ? (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Edit <span className="text-cosmic">repository</span>
            </h1>
            <p className="max-w-prose text-muted-foreground">
              Update your repository's details. This republishes its{' '}
              <span className="font-mono text-sm">kind:30617</span> announcement; the code and clone
              URLs stay put.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Add a <span className="text-cosmic">repository</span>
            </h1>
            <p className="max-w-prose text-muted-foreground">
              Publish a git repository to Nostr as a{' '}
              <span className="font-mono text-sm">kind:30617</span> event so it outlives any single forge.
            </p>
          </>
        )}
      </div>

      {!user ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Alert>
              <AlertCircle className="size-4" />
              <AlertDescription>
                You must be logged in to {isEditMode ? 'edit' : 'add'} a repository.
              </AlertDescription>
            </Alert>
            <LoginArea className="max-w-60" />
          </CardContent>
        </Card>
      ) : editGuard === 'loading' ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Loading repository…</p>
          </CardContent>
        </Card>
      ) : editGuard ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            {editGuard === 'invalid'
              ? "That isn't a valid repository link."
              : editGuard === 'forbidden'
                ? 'Only the account that published this repository can edit it.'
                : "Couldn't find this repository. Its announcement may not have reached your relays yet."}
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Path: two distinct cards (create vs. existing). Hidden when editing. */}
              {!isEditMode && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How to add the repository">
                  <ModeCard
                    active={mode === 'create'}
                    onClick={() => { setMode('create'); setErrors({}); }}
                    icon={Plus}
                    title="Create new"
                    blurb="Start a fresh repo. NostrHub initializes it and pushes it to a GRASP server for you."
                  />
                  <ModeCard
                    active={mode === 'existing'}
                    onClick={() => { setMode('existing'); setErrors({}); }}
                    icon={Link2}
                    title="Add existing"
                    blurb="Have a repo elsewhere? NostrHub clones it and mirrors it onto a GRASP server."
                  />
                </div>
              )}

              {/* Add existing: progressive disclosure — clone URL first. */}
              {!isEditMode && mode === 'existing' && !existingRevealed && (
                <div className="space-y-1.5">
                  <Label htmlFor="clone-url" className="flex items-center gap-1.5">
                    <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" /> Clone URL
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="About clone URLs" className="rounded-full text-muted-foreground hover:text-foreground">
                          <Info className="size-3.5" aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        An https:// mirror or a nostr:// URL. To mirror an external repo, push it to a GRASP
                        server with ngit, then paste its nostr:// URL here.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="clone-url"
                      value={existingUrl}
                      onChange={(e) => { setExistingUrl(e.target.value); clearError('cloneUrls'); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleProbeExisting(); } }}
                      placeholder="https://github.com/owner/repo.git or nostr://npub…/repo"
                      aria-invalid={!!errors.cloneUrls}
                      className="font-mono text-sm"
                    />
                    <Button type="button" onClick={handleProbeExisting} disabled={isCloning || !existingUrl.trim()} className="gap-1.5">
                      {isCloning ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
                      Continue
                    </Button>
                  </div>
                  <FieldError message={errors.cloneUrls} />
                  <p className="text-xs text-muted-foreground">
                    We'll read its name and description, then mirror its code onto Nostr in the next step.
                  </p>
                </div>
              )}

              {/* The rest of the form: always for 'create' or edit, after the probe for 'existing'. */}
              {(isEditMode || mode === 'create' || existingRevealed) && (
                <>
                  {/* Source (existing mode): what we're mirroring. */}
                  {!isEditMode && mode === 'existing' && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" /> Source
                      </Label>
                      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs">{existingUrl}</code>
                        <button
                          type="button"
                          onClick={() => setExistingRevealed(false)}
                          className="shrink-0 text-xs font-medium text-primary hover:underline"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="repo-name">Name</Label>
                    <Input
                      id="repo-name"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="my-project"
                      aria-invalid={!!errors.name}
                      className="font-medium"
                    />
                    <FieldError message={errors.name} />
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor="repo-desc">Description</Label>
                    <Textarea
                      id="repo-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What does this repository do?"
                      rows={2}
                    />
                  </div>

                  {/* Where to host it — both modes push to a GRASP server. Not editable after publishing. */}
                  {!isEditMode && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Server className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      {mode === 'create' ? 'Host on' : 'Mirror to'}
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {graspServers.map((url) => {
                        const active = selectedGrasp.includes(url);
                        return (
                          <button
                            key={url}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleGrasp(url)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              active
                                ? 'border-primary/50 bg-primary/10 text-foreground'
                                : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                            )}
                          >
                            {graspHost(url)}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setShowGraspInput((v) => !v)}
                        aria-expanded={showGraspInput}
                        aria-label="Add a GRASP server"
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm font-medium transition-colors',
                          'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        <Plus className="size-3.5" aria-hidden="true" /> Add
                      </button>
                    </div>
                    {showGraspInput && (
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          value={graspDraft}
                          onChange={(e) => { setGraspDraft(e.target.value); clearError('graspInput'); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); addGrasp(); }
                            if (e.key === 'Escape') { setShowGraspInput(false); setGraspDraft(''); }
                          }}
                          placeholder="wss://your-grasp-server.example"
                          aria-invalid={!!errors.graspInput}
                          aria-label="GRASP server URL"
                          className="font-mono text-sm"
                        />
                        <Button type="button" variant="outline" size="icon" onClick={addGrasp} aria-label="Add GRASP server">
                          <Plus className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                    <FieldError message={errors.graspInput} />
                    <FieldError message={errors.grasp} />
                    <p className="pt-0.5 text-xs text-muted-foreground">
                      {mode === 'create'
                        ? 'NostrHub initializes the repo and pushes the first commit here.'
                        : 'NostrHub clones the source and pushes its objects here, so the code truly lives on Nostr.'}
                      {identifier && selectedGrasp.length > 0 && (
                        <>
                          {' '}Cloneable at{' '}
                          <code className="break-all font-mono">
                            {graspCloneUrl(selectedGrasp[0], user.pubkey, identifier)}
                          </code>
                        </>
                      )}
                    </p>
                  </div>
                  )}

              {/* Topics */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Tags className="size-3.5 text-muted-foreground" aria-hidden="true" /> Topics
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set([...SUGGESTED_TOPICS, ...hashtags])].map((t) => {
                    const active = hashtags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleTopic(t)}
                        className={cn(
                          'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary/50 bg-primary/10 text-foreground'
                            : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                        )}
                      >
                        #{t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Advanced */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                  <ChevronRight className={cn('size-3.5 transition-transform', advancedOpen && 'rotate-90')} aria-hidden="true" />
                  Advanced
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="repo-id">Identifier</Label>
                    <Input
                      id="repo-id"
                      value={identifier}
                      onChange={(e) => handleIdentifierChange(e.target.value)}
                      placeholder="my-project"
                      className="font-mono text-sm"
                      readOnly={isEditMode}
                      disabled={isEditMode}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isEditMode
                        ? "The d tag is fixed once a repo is published — it can't be changed."
                        : "Stable kebab-case slug for the d tag. Defaults to the name; don't change it after publishing."}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Globe className="size-3.5 text-muted-foreground" aria-hidden="true" /> Web URLs
                    </Label>
                    <ListInput
                      placeholder="https://… (homepage / browse)"
                      values={webUrls}
                      onChange={setWebUrls}
                      validate={isHttpsOrNostr}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-5">
                <Button type="button" variant="ghost" asChild>
                  <Link to={backTo}>Cancel</Link>
                </Button>
                <Button type="submit" disabled={isPending} className="gap-1.5">
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : isEditMode ? (
                    <Save className="size-4" aria-hidden="true" />
                  ) : mode === 'create' ? (
                    <Plus className="size-4" aria-hidden="true" />
                  ) : (
                    <Send className="size-4" aria-hidden="true" />
                  )}
                  {isEditMode
                    ? 'Save changes'
                    : mode === 'create'
                      ? 'Create repository'
                      : 'Mirror to Nostr'}
                </Button>
              </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </Layout>
  );
};

export default AddRepoPage;
