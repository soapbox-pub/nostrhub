import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ArticleEditor } from '@/components/ArticleEditor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const CreateArticlePage = () => {
  const { user } = useCurrentUser();

  useSeoMeta({
    title: 'Write an article | NostrHub',
    description: 'Publish a long-form article (NIP-23) and share it with the Nostr community.',
  });

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
            <ArticleEditor />
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
