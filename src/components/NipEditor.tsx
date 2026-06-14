import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { Save, GitFork, X, Plus, FileText } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { useSaveNip, buildNipTags, type SaveNipParams } from '@/hooks/useSaveNip';
import { useDrafts } from '@/hooks/useDrafts';
import { useToast } from '@/hooks/useToast';
import { slugify, parseCustomNip, CUSTOM_NIP_KIND, type CustomNip } from '@/lib/nips';
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
  identifier?: string;
  content?: string;
  kinds?: string[];
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
  const [identifier, setIdentifier] = useState(editing?.identifier ?? initial?.identifier ?? '');
  const [content, setContent] = useState(editing?.content ?? initial?.content ?? '');
  const [kinds, setKinds] = useState<string[]>(editing?.kinds ?? initial?.kinds ?? []);
  const [kindInput, setKindInput] = useState('');
  const [identifierEdited, setIdentifierEdited] = useState(!!editing || !!initial?.identifier);

  // The draft slug we're currently editing into, so repeated saves overwrite
  // the same draft instead of piling up new ones.
  const [draftSlug, setDraftSlug] = useState<string | null>(initial?.draftSlug ?? null);

  // Derive the identifier from the title until the user edits it directly.
  const effectiveIdentifier = useMemo(() => {
    if (editing) return editing.identifier;
    if (identifierEdited) return identifier;
    return slugify(title);
  }, [editing, identifier, identifierEdited, title]);

  const fork = editing ? undefined : initial?.fork;

  const addKind = () => {
    const k = kindInput.trim();
    if (!k || !/^\d+$/.test(k)) {
      toast({ title: 'Enter a numeric event kind', variant: 'destructive' });
      return;
    }
    if (!kinds.includes(k)) setKinds([...kinds, k]);
    setKindInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !effectiveIdentifier.trim() || !content.trim()) {
      toast({ title: 'Title, identifier, and content are required', variant: 'destructive' });
      return;
    }

    saveNip(
      { identifier: effectiveIdentifier, title, content, kinds, fork, original: editing },
      {
        onSuccess: (event) => {
          const naddr = nip19.naddrEncode({
            kind: event.kind,
            pubkey: event.pubkey,
            identifier: event.tags.find(([n]) => n === 'd')?.[1] ?? effectiveIdentifier,
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
      identifier: effectiveIdentifier || slugify(title) || 'untitled',
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          <Label htmlFor="identifier">Identifier</Label>
          <Input
            id="identifier"
            value={effectiveIdentifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setIdentifierEdited(true);
            }}
            placeholder="encrypted-group-metadata"
            disabled={!!editing}
            required
          />
          <p className="text-xs text-muted-foreground">
            {editing ? 'Identifier is fixed for an existing NIP.' : 'Used in the address; auto-filled from the title.'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="kind-input">Event kinds (optional)</Label>
        <div className="flex gap-2">
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
            placeholder="e.g. 30817"
            inputMode="numeric"
            className="max-w-40"
          />
          <Button type="button" variant="outline" onClick={addKind} className="gap-1.5">
            <Plus className="size-4" /> Add kind
          </Button>
        </div>
        {kinds.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {kinds.map((k) => (
              <Badge key={k} variant="secondary" className="gap-1 font-mono">
                {k}
                <button
                  type="button"
                  onClick={() => setKinds(kinds.filter((x) => x !== k))}
                  aria-label={`Remove kind ${k}`}
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
