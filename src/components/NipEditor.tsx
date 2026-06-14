import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { Save, GitFork, X, Plus, FileText } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { useSaveNip, buildNipTags, type SaveNipParams, type NipKind } from '@/hooks/useSaveNip';
import { useDrafts } from '@/hooks/useDrafts';
import { useToast } from '@/hooks/useToast';
import { generateIdentifier, parseCustomNip, CUSTOM_NIP_KIND, type CustomNip } from '@/lib/nips';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** Pre-filled values when forking another NIP or resuming a saved draft. */
export interface NipEditorInitial {
  title?: string;
  /** Stable identifier carried over from a resumed draft, so it survives publish. */
  identifier?: string;
  content?: string;
  kinds?: NipKind[];
  fork?: SaveNipParams['fork'];
  forkLabel?: string;
  /** Slug of the draft being resumed, so repeated saves overwrite it. */
  draftSlug?: string;
}

interface NipEditorProps {
  /** Existing NIP to edit (locks identifier and preserves fork markers). */
  editing?: CustomNip;
  /** Initial values, e.g. from a fork source or a resumed draft. Ignored when `editing` is set. */
  initial?: NipEditorInitial;
}

export function NipEditor({ editing, initial }: NipEditorProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate: saveNip, isPending } = useSaveNip();
  const { saveDraft, deleteDraft, hasNip44Support } = useDrafts();

  const [title, setTitle] = useState(editing?.title ?? initial?.title ?? '');
  const [content, setContent] = useState(editing?.content ?? initial?.content ?? '');
  const [kinds, setKinds] = useState<NipKind[]>(
    () =>
      initial?.kinds ??
      editing?.kinds.map((k) => ({ kind: k, name: editing.kindNames[k] ?? '' })) ??
      [],
  );
  const [kindInput, setKindInput] = useState('');
  const [kindNameInput, setKindNameInput] = useState('');

  // The addressable identifier (`d` tag) is opaque and stable for the whole
  // lifecycle: reuse the existing one when editing or resuming a draft,
  // otherwise mint a random one ONCE so it survives every draft save → resume
  // → publish without ever changing or leaking the title.
  const [identifier] = useState(
    () => editing?.identifier ?? initial?.identifier ?? generateIdentifier(),
  );

  // The draft slug we're currently editing into, so repeated saves overwrite
  // the same draft instead of piling up new ones.
  const [draftSlug, setDraftSlug] = useState<string | null>(initial?.draftSlug ?? null);

  const fork = editing ? undefined : initial?.fork;

  const addKind = () => {
    const kind = kindInput.trim();
    const name = kindNameInput.trim();
    if (!kind || !/^\d+$/.test(kind)) {
      toast({ title: 'Enter a numeric event kind', variant: 'destructive' });
      return;
    }
    if (!name) {
      toast({ title: 'Enter a name for this kind', variant: 'destructive' });
      return;
    }
    if (kinds.some((k) => k.kind === kind)) {
      toast({ title: `Kind ${kind} is already added`, variant: 'destructive' });
      return;
    }
    setKinds([...kinds, { kind, name }]);
    setKindInput('');
    setKindNameInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast({ title: 'Title and content are required', variant: 'destructive' });
      return;
    }

    saveNip(
      { identifier, title, content, kinds, fork, original: editing },
      {
        onSuccess: (event) => {
          const naddr = nip19.naddrEncode({
            kind: event.kind,
            pubkey: event.pubkey,
            identifier: event.tags.find(([n]) => n === 'd')?.[1] ?? identifier,
          });
          // Seed the detail-page cache with the freshly signed event so
          // navigation is optimistic — relays may not index it for a few
          // seconds, which would otherwise render "NIP not found".
          const parsed = parseCustomNip(event);
          queryClient.setQueryData(['custom-nip', naddr], parsed);
          queryClient.setQueryData(['custom-nip-by-address', parsed.address], parsed);
          // Now that it's published, drop the working draft (if any).
          if (draftSlug) deleteDraft.mutate({ slug: draftSlug });
          toast({ title: editing ? 'NIP updated' : 'NIP published' });
          navigate(`/${naddr}`);
        },
        onError: (err) => toast({ title: 'Failed to publish', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const handleSaveDraft = () => {
    if (!title.trim() && !content.trim()) {
      toast({ title: 'Nothing to save yet', variant: 'destructive' });
      return;
    }
    const params: SaveNipParams = {
      identifier,
      title: title || 'Untitled NIP',
      content,
      kinds,
      fork,
      original: editing,
    };
    saveDraft.mutate(
      {
        template: { kind: CUSTOM_NIP_KIND, content: content.trim(), tags: buildNipTags(params) },
        slug: draftSlug ?? undefined,
      },
      {
        onSuccess: ({ slug }) => {
          setDraftSlug(slug);
          toast({ title: 'Draft saved', description: 'Find it under your drafts to pick up later.' });
        },
        onError: (err) => toast({ title: 'Failed to save draft', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const forkLabel = editing ? null : initial?.forkLabel ?? null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {forkLabel && (
        <Alert>
          <GitFork className="size-4" />
          <AlertDescription>
            Forking <span className="font-semibold">{forkLabel}</span>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Encrypted Group Metadata"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="kind-input">Event kinds (optional)</Label>
        <p className="text-sm text-muted-foreground">
          Add each event kind this NIP defines or concerns, with a short human-readable name.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="kind-input"
            value={kindInput}
            onChange={(e) => setKindInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKind();
              }
            }}
            placeholder="Kind, e.g. 37516"
            inputMode="numeric"
            aria-label="Event kind number"
            className="sm:max-w-40"
          />
          <Input
            id="kind-name-input"
            value={kindNameInput}
            onChange={(e) => setKindNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKind();
              }
            }}
            placeholder="Name, e.g. Geocache Listing"
            aria-label="Kind name"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addKind} className="gap-1.5">
            <Plus className="size-4" /> Add kind
          </Button>
        </div>
        {kinds.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {kinds.map((k) => (
              <Badge key={k.kind} variant="secondary" className="gap-1.5">
                <span className="font-mono">{k.kind}</span>
                <span className="text-muted-foreground">{k.name}</span>
                <button
                  type="button"
                  onClick={() => setKinds(kinds.filter((x) => x.kind !== k.kind))}
                  aria-label={`Remove kind ${k.kind} (${k.name})`}
                  className="hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Content (Markdown)</Label>
        <Tabs defaultValue="write">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="write">
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your NIP in Markdown…"
              className="min-h-[400px] font-mono text-sm"
              required
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="min-h-[400px] overflow-auto rounded-md border border-border bg-muted/40 p-4">
              {content ? (
                <MarkdownContent content={content} />
              ) : (
                <p className="text-muted-foreground">Nothing to preview yet.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex flex-col justify-end gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => navigate(-1)} className="sm:w-auto">
          Cancel
        </Button>
        {!editing && hasNip44Support && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleSaveDraft}
            disabled={saveDraft.isPending}
            className="gap-1.5 sm:w-auto"
          >
            <FileText className="size-4" />
            {saveDraft.isPending ? 'Saving…' : 'Save draft'}
          </Button>
        )}
        <Button type="submit" disabled={isPending} className="gap-1.5 sm:w-auto">
          <Save className="size-4" />
          {isPending ? 'Publishing…' : editing ? 'Update NIP' : 'Publish NIP'}
        </Button>
      </div>
    </form>
  );
}

export default NipEditor;
