import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ExternalLink, GitFork, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { MarkdownContent } from '@/components/MarkdownContent';
import { ApproveButton } from '@/components/ApproveButton';
import { useOfficialNip } from '@/hooks/useOfficialNips';
import type { NipTarget } from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

const GITHUB_BASE = 'https://github.com/nostr-protocol/nips/blob/master';

function extractTitle(content: string, fallback: string): string {
  const line = content.split('\n').find((l) => l.startsWith('# '));
  return line ? line.replace(/^#\s+/, '').trim() : fallback;
}

const OfficialNipPage = () => {
  const { number } = useParams<{ number: string }>();
  const code = (number ?? '').toUpperCase();
  const { data, isLoading, isError } = useOfficialNip(code);

  const title = useMemo(
    () => (data ? extractTitle(data.content, `NIP-${code}`) : `NIP-${code}`),
    [data, code],
  );

  useSeoMeta({
    title: `NIP-${code}${data ? ` — ${title}` : ''} | NostrHub`,
    description: `Read and approve NIP-${code} on NostrHub.`,
  });

  const target: NipTarget = { type: 'official', number: code };

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to="/">
          <ArrowLeft className="mr-1.5 size-4" /> Back to NIPs
        </Link>
      </Button>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      ) : isError || !data ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>Could not load NIP-{code}. It may not exist.</AlertDescription>
        </Alert>
      ) : (
        <article>
          <header className="space-y-4 border-b border-border/60 pb-6">
            <div>
              <p className="font-mono text-sm text-primary">NIP-{code}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ApproveButton target={target} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link to={`/create?officialFork=${code}`}>
                    <GitFork className="size-4" /> Fork
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild className="gap-1.5">
                  <a href={`${GITHUB_BASE}/${code}.md`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" /> GitHub
                  </a>
                </Button>
              </div>
            </div>
          </header>

          <Card className="mt-6">
            <CardContent className="p-6">
              <MarkdownContent content={data.content} />
            </CardContent>
          </Card>
        </article>
      )}
    </Layout>
  );
};

export default OfficialNipPage;
