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
import { useExpertArticles, type ExpertArticle } from '@/hooks/useExpertPress';
import { useExperts } from '@/hooks/useExperts';
import { Button } from '@/components/ui/button';

function matchesSearch(article: ExpertArticle, q: string): boolean {
  if (!q) return true;
  return (
    article.title.toLowerCase().includes(q) ||
    (article.summary?.toLowerCase().includes(q) ?? false)
  );
}

/**
 * Directory of long-form articles (NIP-23, kind 30023) published by the panel
 * of experts. The newest piece anchors the page as a lead feature; the rest
 * fill a responsive grid. Searchable by title and summary.
 */
export function ArticlesPage() {
  const { experts } = useExperts();
  const [search, setSearch] = useState('');
  const { data: articles, isLoading } = useExpertArticles();

  useSeoMeta({
    title: 'Articles | NostrHub',
    description:
      'Long-form dispatches from the panel: in-depth articles and essays on building the Nostr protocol.',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (articles ?? []).filter((article) => matchesSearch(article, q));
  }, [articles, search]);

  const hasExperts = experts.length > 0;
  const hasAnything = (articles ?? []).length > 0;

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
