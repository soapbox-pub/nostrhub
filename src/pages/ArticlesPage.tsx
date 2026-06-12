import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Users, PenSquare } from 'lucide-react';
import {
  LeadArticleCard,
  ArticleCard,
  ArticleCardSkeleton,
} from '@/components/ArticleCards';
import {
  DiscoveryGrid,
  DiscoveryPage,
  DiscoverySearch,
} from '@/components/DiscoveryGrid';
import {
  useExpertArticles,
  useCommunityArticles,
  type ExpertArticle,
} from '@/hooks/useExpertPress';
import { useExperts } from '@/hooks/useExperts';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { Button } from '@/components/ui/button';

/** Expert articles lead the page; everything after this is community backfill. */
const EXPERT_LEAD_COUNT = 4;

function matchesSearch(article: ExpertArticle, q: string): boolean {
  if (!q) return true;
  return (
    article.title.toLowerCase().includes(q) ||
    (article.summary?.toLowerCase().includes(q) ?? false)
  );
}

/**
 * Directory of long-form articles (NIP-23, kind 30023). The freshest pieces
 * from the panel of experts lead the page; the feed then backfills from the
 * broader community web-of-trust. The newest article anchors the page as a
 * lead feature and the rest fill a responsive grid. Searchable by title and
 * summary.
 */
export function ArticlesPage() {
  const { experts } = useExperts();
  const [search, setSearch] = useState('');
  const { data: expertArticles, isLoading: expertsLoading } = useExpertArticles();

  // Broaden beyond the panel: backfill with the whole community web-of-trust.
  const community = useCommunityAuthors();
  const { data: communityArticles, isLoading: communityLoading } = useCommunityArticles(
    community.data?.authors,
  );

  useSeoMeta({
    title: 'Articles | NostrHub',
    description:
      'Long-form dispatches from the panel: in-depth articles and essays on building the Nostr protocol.',
  });

  // The freshest expert pieces lead the page. Everything after the leads comes
  // from the community set (which already includes the experts), ranked by
  // web-of-trust — how many experts follow the author — then recency. Experts
  // are ranked like everyone else, so a well-followed or fresh community post
  // isn't buried beneath old expert articles. Authors with no expert follows
  // are dropped.
  const combined = useMemo(() => {
    const lead = (expertArticles ?? []).slice(0, EXPERT_LEAD_COUNT);
    const seen = new Set(lead.map((a) => a.naddr));
    const followCounts = community.data?.followCounts;

    const rest = (communityArticles ?? [])
      .filter((a) => {
        if (seen.has(a.naddr)) return false;
        if ((followCounts?.get(a.author) ?? 0) === 0) return false;
        seen.add(a.naddr);
        return true;
      })
      .sort((a, b) => {
        const fa = followCounts?.get(a.author) ?? 0;
        const fb = followCounts?.get(b.author) ?? 0;
        return fb - fa || b.publishedAt - a.publishedAt;
      });

    return [...lead, ...rest];
  }, [expertArticles, communityArticles, community.data?.followCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return combined.filter((article) => matchesSearch(article, q));
  }, [combined, search]);

  const hasExperts = experts.length > 0;
  const hasAnything = combined.length > 0;
  const isLoading = expertsLoading || community.isLoading || communityLoading;

  // The newest article anchors the page; the rest flow into the grid below.
  const [lead, ...rest] = filtered;

  return (
    <DiscoveryPage
      title="Articles"
      description="Long-form dispatches from the panel: in-depth essays and reporting on building the Nostr protocol."
      action={
        <Button asChild size="sm" className="gap-1.5 rounded-full">
          <Link to="/articles/create">
            <PenSquare className="size-4" />
            Write
          </Link>
        </Button>
      }
      filters={
        hasAnything && (
          <DiscoverySearch
            label="Search articles"
            placeholder="Search by title or summary…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )
      }
    >
      {!hasExperts ? (
        <DiscoveryGrid
          items={[]}
          isLoading={false}
          getKey={() => ''}
          renderItem={() => null}
          renderSkeleton={() => <ArticleCardSkeleton />}
          empty={
            <span className="flex flex-col items-center gap-3">
              Recruit a panel of Nostr experts to start surfacing their articles.
              <Button asChild size="sm" variant="outline" className="gap-1.5 rounded-full">
                <Link to="/settings">
                  <Users className="size-4" />
                  Configure experts
                </Link>
              </Button>
            </span>
          }
        />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <DiscoveryGrid
          items={[]}
          isLoading={false}
          getKey={() => ''}
          renderItem={() => null}
          renderSkeleton={() => <ArticleCardSkeleton />}
          empty={
            hasAnything
              ? 'No articles match your search.'
              : 'No articles found yet. Try checking your relay connections or wait a moment for content to load.'
          }
        />
      ) : (
        <div className="space-y-4">
          {lead && <LeadArticleCard article={lead} />}
          {rest.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((article) => (
                <ArticleCard key={article.naddr} article={article} />
              ))}
            </div>
          )}
        </div>
      )}
    </DiscoveryPage>
  );
}

export default ArticlesPage;
