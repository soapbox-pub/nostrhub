import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ArticleEditor, type ArticleEditorInitial } from '@/components/ArticleEditor';
import { ResumeDraftsBanner } from '@/components/ResumeDraftsBanner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDrafts, findDraft } from '@/hooks/useDrafts';
import { ARTICLE_KIND } from '@/hooks/useExpertPress';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const CreateArticlePage = () => {
  const { user } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const draftParam = searchParams.get('draft');

  const { drafts } = useDrafts();
  const loadedDraft = findDraft(drafts.data, draftParam);

  useSeoMeta({
    title: 'Write an article | NostrHub',
    description: 'Publish a long-form article (NIP-23) and share it with the Nostr community.',
  });

  const initialDraft = useMemo<ArticleEditorInitial | undefined>(() => {
    if (!draftParam || !loadedDraft) return undefined;
    const t = loadedDraft.template;
    const findTag = (name: string) => t.tags.find(([n]) => n === name)?.[1];
    return {
      title: findTag('title') ?? '',
      identifier: findTag('d') ?? '',
      summary: findTag('summary') ?? '',
      image: sanitizeUrl(findTag('image')) ?? '',
      content: t.content,
      draftSlug: loadedDraft.slug,
    };
  }, [draftParam, loadedDraft]);

  // Remount the editor once a resumed draft resolves so its initial state hydrates.
  const editorKey = `${loadedDraft?.slug ?? draftParam ?? ''}:${initialDraft ? 'ready' : 'empty'}`;

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to="/articles">
          <ArrowLeft className="mr-1.5 size-4" /> Back to articles
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Write an article</CardTitle>
        </CardHeader>
        <CardContent>
          {user ? (
            <>
              <ResumeDraftsBanner kind={ARTICLE_KIND} currentSlug={draftParam} />
              <ArticleEditor key={editorKey} initialDraft={initialDraft} />
            </>
          ) : (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="size-4" />
                <AlertDescription>You must be logged in to publish an article.</AlertDescription>
              </Alert>
              <LoginArea className="max-w-60" />
            </div>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
};

export default CreateArticlePage;
