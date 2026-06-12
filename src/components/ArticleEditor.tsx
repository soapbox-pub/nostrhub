import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Save, ImagePlus, Loader2, X } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { useSaveArticle, articleToParams } from '@/hooks/useSaveArticle';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { slugify } from '@/lib/nips';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { type ExpertArticle } from '@/hooks/useExpertPress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ArticleEditorProps {
  /** Existing article to edit (locks identifier, preserves publish date). */
  editing?: ExpertArticle;
}

export function ArticleEditor({ editing }: ArticleEditorProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mutate: saveArticle, isPending } = useSaveArticle();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initial = editing ? articleToParams(editing) : undefined;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [identifier, setIdentifier] = useState(initial?.identifier ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [image, setImage] = useState(initial?.image ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [identifierEdited, setIdentifierEdited] = useState(!!editing);

  // Derive the identifier from the title until the user edits it directly.
  const effectiveIdentifier = useMemo(() => {
    if (editing) return editing.identifier;
    if (identifierEdited) return identifier;
    return slugify(title);
  }, [editing, identifier, identifierEdited, title]);

  const handleImageUpload = async (file: File) => {
    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      const safe = sanitizeUrl(url);
      if (!safe) {
        toast({ title: 'Upload returned an unusable URL', variant: 'destructive' });
        return;
      }
      setImage(safe);
    } catch (err) {
      toast({
        title: 'Image upload failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !effectiveIdentifier.trim() || !content.trim()) {
      toast({ title: 'Title, identifier, and content are required', variant: 'destructive' });
      return;
    }

    saveArticle(
      {
        identifier: effectiveIdentifier,
        title,
        content,
        summary: summary.trim() || undefined,
        image: image.trim() || undefined,
        publishedAt: editing?.publishedAt,
      },
      {
        onSuccess: (event) => {
          const naddr = nip19.naddrEncode({
            kind: event.kind,
            pubkey: event.pubkey,
            identifier: event.tags.find(([n]) => n === 'd')?.[1] ?? effectiveIdentifier,
          });
          toast({ title: editing ? 'Article updated' : 'Article published' });
          navigate(`/${naddr}`);
        },
        onError: (err) =>
          toast({ title: 'Failed to publish', description: err.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The State of Nostr Relays"
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
            placeholder="the-state-of-nostr-relays"
            disabled={!!editing}
            required
          />
          <p className="text-xs text-muted-foreground">
            {editing
              ? 'Identifier is fixed for an existing article.'
              : 'Used in the address; auto-filled from the title.'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="summary">Summary (optional)</Label>
        <Textarea
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="A short teaser shown in article listings."
          className="min-h-[80px]"
        />
      </div>

      <div className="space-y-2">
        <Label>Cover image (optional)</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file);
            e.target.value = '';
          }}
        />
        {image ? (
          <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-border">
            <img src={image} alt="Article cover" className="aspect-video w-full object-cover" />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => setImage('')}
              aria-label="Remove cover image"
              className="absolute right-2 top-2 size-8 rounded-full"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="gap-1.5"
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {isUploading ? 'Uploading…' : 'Upload cover image'}
          </Button>
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
              placeholder="Write your article in Markdown…"
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
        <Button type="submit" disabled={isPending} className="gap-1.5 sm:w-auto">
          <Save className="size-4" />
          {isPending ? 'Publishing…' : editing ? 'Update article' : 'Publish article'}
        </Button>
      </div>
    </form>
  );
}

export default ArticleEditor;
