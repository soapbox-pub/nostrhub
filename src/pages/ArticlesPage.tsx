import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
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

  // The freshest expert pieces lead the page. Everything after the leads —
  // remaining expert articles plus the broader community — is merged into a
  // single pool ranked by web-of-trust (how many experts follow the author)
  // then recency, so a well-followed or fresh post isn't buried beneath every
  // old expert article. Community authors with no expert follows are dropped.
  const combined = useMemo(() => {
    const lead = (expertArticles ?? []).slice(0, EXPERT_LEAD_COUNT);
    const seen = new Set(lead.map((a) => a.naddr));
    const followCounts = community.data?.followCounts;
    const expertSet = new Set(experts);

    // Trust score = how many experts follow the author. Experts get a small
    // floor (the panel implicitly vouches for itself) so a typical expert
    // outranks an unfollowed author, but a widely-followed community voice can
    // still rise above a stale expert post rather than every expert article
    // sitting on top.
    const EXPERT_FLOOR = Math.max(1, Math.ceil(experts.length / 2));
    const trust = (a: ExpertArticle) => {
      const follows = followCounts?.get(a.author) ?? 0;
      return expertSet.has(a.author) ? Math.max(follows, EXPERT_FLOOR) : follows;
    };

    const pool = [...(expertArticles ?? []).slice(EXPERT_LEAD_COUNT), ...(communityArticles ?? [])]
      .filter((a) => {
        if (seen.has(a.naddr)) return false;
        // Drop community authors with no web-of-trust signal.
        if (!expertSet.has(a.author) && (followCounts?.get(a.author) ?? 0) === 0) return false;
        seen.add(a.naddr);
        return true;
      })
      .sort((a, b) => trust(b) - trust(a) || b.publishedAt - a.publishedAt);

    return [...lead, ...pool];
  }, [expertArticles, communityArticles, community.data?.followCounts, experts]);

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
