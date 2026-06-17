import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipEditor, type NipEditorInitial } from '@/components/NipEditor';
import { ResumeDraftsBanner } from '@/components/ResumeDraftsBanner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCustomNip } from '@/hooks/useCustomNips';
import { useOfficialNip } from '@/hooks/useOfficialNips';
import { useDrafts, findDraft } from '@/hooks/useDrafts';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const GITHUB_BASE = 'https://github.com/nostr-protocol/nips/blob/master';

/** Prefill passed via router state, e.g. "Publish NIP" from a repo's NIP.md. */
interface CreateNipLocationState {
  title?: string;
  content?: string;
}

function parseLocationState(state: unknown): CreateNipLocationState | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const { title, content } = state as Record<string, unknown>;
  if (typeof title !== 'string' && typeof content !== 'string') return undefined;
  return {
    title: typeof title === 'string' ? title : undefined,
    content: typeof content === 'string' ? content : undefined,
  };
}

const CreateNipPage = () => {
  const { user } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const forkParam = searchParams.get('fork'); // custom NIP naddr
  const officialForkParam = searchParams.get('officialFork'); // official NIP code
  const draftParam = searchParams.get('draft'); // resume a saved draft
  const statePrefill = useMemo(() => parseLocationState(location.state), [location.state]);

  const { data: customForkSource } = useCustomNip(forkParam ?? undefined);
  const { data: officialForkSource } = useOfficialNip(officialForkParam ?? undefined);
  const { drafts } = useDrafts();
  const loadedDraft = findDraft(drafts.data, draftParam);

  useSeoMeta({
    title: 'Draft a NIP | NostrHub',
    description: 'Draft a new Nostr Implementation Possibility and share it with the community.',
  });

  const initial = useMemo<NipEditorInitial | undefined>(() => {
    // Resuming a saved draft takes precedence over fork/state prefills.
    if (draftParam && loadedDraft) {
      const t = loadedDraft.template;
      const findTag = (name: string) => t.tags.find(([n]) => n === name)?.[1];
      return {
        title: findTag('title') ?? '',
        identifier: findTag('d') ?? '',
        content: t.content,
        kinds: t.tags
          .filter(([n, v]) => n === 'k' && v)
          .map(([, kind, name]) => ({ kind, name: name ?? '' })),
        draftSlug: loadedDraft.slug,
      };
    }
    if (forkParam && customForkSource) {
      return {
        title: `${customForkSource.title} (fork)`,
        content: customForkSource.content,
        kinds: customForkSource.kinds.map((kind) => ({
          kind,
          name: customForkSource.kindNames[kind] ?? '',
        })),
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
    if (statePrefill) {
      return { title: statePrefill.title, content: statePrefill.content };
    }
    return undefined;
  }, [draftParam, loadedDraft, forkParam, customForkSource, officialForkParam, officialForkSource, statePrefill]);

  // Remount the editor once fork/draft data resolves so its initial state hydrates.
  const editorKey = `${forkParam ?? ''}:${officialForkParam ?? ''}:${loadedDraft?.slug ?? draftParam ?? ''}:${initial ? 'ready' : 'empty'}`;

  return (
    <Layout>
      <Button variant="ghost" asChild className="mb-4 -ml-2">
        <Link to="/nips">
          <ArrowLeft className="mr-1.5 size-4" /> Back to NIPs
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Draft a NIP</CardTitle>
        </CardHeader>
        <CardContent>
          {user ? (
            <>
              <ResumeDraftsBanner kind={CUSTOM_NIP_KIND} currentSlug={searchParams.get('draft')} />
              <NipEditor key={editorKey} initial={initial} />
            </>
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
