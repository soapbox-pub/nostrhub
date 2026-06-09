import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipEditor } from '@/components/NipEditor';
import { useCustomNip } from '@/hooks/useCustomNips';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

const EditNipPage = () => {
  const { naddr } = useParams<{ naddr: string }>();
  const { user } = useCurrentUser();
  const { data: nip, isLoading } = useCustomNip(naddr);

  useSeoMeta({
    title: nip ? `Edit: ${nip.title} | NostrHub` : 'Edit NIP | NostrHub',
  });

  const canEdit = !!user && !!nip && user.pubkey === nip.author;

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to={naddr ? `/${naddr}` : '/'}>
          <ArrowLeft className="mr-1.5 size-4" /> Back
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit NIP</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !nip ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>NIP not found.</AlertDescription>
            </Alert>
          ) : !canEdit ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>You can only edit NIPs you authored.</AlertDescription>
            </Alert>
          ) : (
            <NipEditor editing={nip} />
          )}
        </CardContent>
      </Card>
    </Layout>
  );
};

export default EditNipPage;
