import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipEditor, type NipEditorInitial } from '@/components/NipEditor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCustomNip } from '@/hooks/useCustomNips';
import { useOfficialNip } from '@/hooks/useOfficialNips';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const GITHUB_BASE = 'https://github.com/nostr-protocol/nips/blob/master';

const CreateNipPage = () => {
  const { user } = useCurrentUser();
  const [searchParams] = useSearchParams();

  const forkParam = searchParams.get('fork'); // custom NIP naddr
  const officialForkParam = searchParams.get('officialFork'); // official NIP code

  const { data: customForkSource } = useCustomNip(forkParam ?? undefined);
  const { data: officialForkSource } = useOfficialNip(officialForkParam ?? undefined);

  useSeoMeta({
    title: 'Draft a NIP | NostrHub',
    description: 'Draft a new Nostr Implementation Possibility and share it with the community.',
  });

  const initial = useMemo<NipEditorInitial | undefined>(() => {
    if (forkParam && customForkSource) {
      return {
        title: `${customForkSource.title} (fork)`,
        content: customForkSource.content,
        kinds: customForkSource.kinds,
        fork: { type: 'custom', address: customForkSource.address, authorPubkey: customForkSource.author },
        forkLabel: customForkSource.title,
      };
    }
    if (officialForkParam && officialForkSource) {
      const heading = officialForkSource.content.split('\n').find((l) => l.startsWith('# '));
      const title = heading ? heading.replace(/^#\s+/, '').trim() : `NIP-${officialForkParam}`;
      return {
        title,
        content: officialForkSource.content,
        fork: { type: 'official', url: `${GITHUB_BASE}/${officialForkParam.toUpperCase()}.md` },
        forkLabel: `NIP-${officialForkParam.toUpperCase()}`,
      };
    }
    return undefined;
  }, [forkParam, customForkSource, officialForkParam, officialForkSource]);

  // Remount the editor once fork data resolves so its initial state hydrates.
  const editorKey = `${forkParam ?? ''}:${officialForkParam ?? ''}:${initial ? 'ready' : 'empty'}`;

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to="/">
          <ArrowLeft className="mr-1.5 size-4" /> Back to NIPs
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Draft a NIP</CardTitle>
        </CardHeader>
        <CardContent>
          {user ? (
            <NipEditor key={editorKey} initial={initial} />
          ) : (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="size-4" />
                <AlertDescription>You must be logged in to draft a NIP.</AlertDescription>
              </Alert>
              <LoginArea className="max-w-60" />
            </div>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
};

export default CreateNipPage;
