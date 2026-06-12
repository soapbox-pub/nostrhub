import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import type { ExpertArticle } from '@/hooks/useExpertPress';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Compact byline: avatar, name, and publish date. */
export function ArticleByline({
  pubkey,
  timestamp,
  className,
}: {
  pubkey: string;
  timestamp: number;
  className?: string;
}) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || shortNpub(pubkey);
  const date = new Date(timestamp * 1000);

  return (
    <span className={cn('flex min-w-0 items-center gap-2 text-xs text-muted-foreground', className)}>
      <UserAvatar pubkey={pubkey} size="sm" />
      <span className="truncate font-semibold uppercase tracking-wide text-foreground">
        By {name}
      </span>
      <span aria-hidden="true">·</span>
      <time dateTime={date.toISOString()} className="shrink-0">
        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </time>
    </span>
  );
}

/** Cover-image block; renders nothing when the article has no image. */
function ArticleImage({
  image,
  title,
  className,
}: {
  image?: string;
  title: string;
  className?: string;
}) {
  if (!image) return null;
  return (
    <div className={cn('overflow-hidden', className)}>
      <img
        src={image}
        alt={title}
        loading="lazy"
        className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
    </div>
  );
}

/**
 * The lead feature: a full-width editorial spread with the cover image on one
 * side and headline-scale type on the other.
 */
export function LeadArticleCard({ article }: { article: ExpertArticle }) {
  const hasImage = Boolean(article.image);
  return (
    <Card className="group relative overflow-hidden border-primary/25 bg-card/70 py-0 backdrop-blur-sm transition-all duration-300 hover:border-primary/60 hover:shadow-[0_12px_60px_-12px] hover:shadow-primary/40">
      <Link
        to={`/${article.naddr}`}
        className={cn(
          'grid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl',
          hasImage && 'lg:grid-cols-[1.15fr_1fr]',
        )}
      >
        {hasImage && (
          <ArticleImage
            image={article.image}
            title={article.title}
            className="aspect-video lg:aspect-auto lg:h-full lg:min-h-72"
          />
        )}

        <div className="relative flex flex-col gap-4 p-6 sm:p-8">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-nebula/20 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100"
          />
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-sm bg-nebula px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-white">
              Lead Feature
            </span>
            <span className="rotate-[-2deg] rounded-sm border-2 border-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Must Read
            </span>
          </div>

          <h3 className="font-display text-3xl font-bold leading-[1.05] tracking-tight transition-colors group-hover:text-primary sm:text-4xl">
            {article.title}
          </h3>

          {article.summary && (
            <p className="line-clamp-3 text-base leading-relaxed text-muted-foreground">
              {article.summary}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
            <ArticleByline pubkey={article.author} timestamp={article.publishedAt} />
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-primary">
              Read the feature
              <ArrowRight
                className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </Link>
    </Card>
  );
}

/** A standard feature card in the article grid: image on top, dek below. */
export function ArticleCard({ article }: { article: ExpertArticle }) {
  return (
    <Card className="group relative h-full overflow-hidden border-border/70 bg-card/60 py-0 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
      <Link
        to={`/${article.naddr}`}
        className="flex h-full flex-col rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArticleImage image={article.image} title={article.title} className="aspect-[16/9]" />

        <div className="flex flex-1 flex-col gap-2.5 p-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-nebula">
            Feature
          </span>
          <h3 className="line-clamp-2 font-display text-xl font-bold leading-snug tracking-tight transition-colors group-hover:text-primary">
            {article.title}
          </h3>
          {article.summary && (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {article.summary}
            </p>
          )}
          <ArticleByline
            pubkey={article.author}
            timestamp={article.publishedAt}
            className="mt-auto pt-2"
          />
        </div>
      </Link>
    </Card>
  );
}

/** Loading placeholder matching the shape of {@link ArticleCard}. */
export function ArticleCardSkeleton() {
  return (
    <Card className="h-full overflow-hidden border-border/70 bg-card/60 py-0">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="flex flex-col gap-2.5 p-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    </Card>
  );
}
