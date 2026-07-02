import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Shared branding for detail-page heroes (NIPs, git repos, apps).
 *
 * House style, in one place:
 * - brand icon tile: gradient `rounded-2xl` with primary ring + glow
 *   (artwork tiles swap to a bordered, muted treatment so images read well)
 * - title: `font-display text-3xl sm:text-4xl font-bold tracking-tight`
 * - actions: primary (default variant/size) on the left, secondary
 *   (`outline` `sm`) grouped on the right; all buttons keep `rounded-md`
 */

/** Ghost back-navigation button rendered above the hero. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button variant="ghost" asChild className="-ml-2 mb-4">
      <Link to={to}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" /> {children}
      </Link>
    </Button>
  );
}

/**
 * The branded hero tile. Pass `image` for real artwork (app icons);
 * otherwise the lucide `icon` sits on the brand gradient.
 */
export function HeroTile({ icon, image }: { icon: ReactNode; image?: string | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl sm:size-16',
        image
          ? 'border border-border/60 bg-muted/40 shadow-md'
          : 'bg-gradient-to-br from-primary/20 via-primary/10 to-nebula/20 ring-1 ring-primary/20 glow motion-safe:animate-[float-slow_6s_ease-in-out_infinite]',
      )}
    >
      {image ? <img src={image} alt="" className="size-full object-cover" /> : icon}
    </span>
  );
}

/**
 * Secondary hero action linking to an external site: `outline` `sm` with a
 * leading icon and the trailing external-link affordance.
 */
export function HeroExternalLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Button variant="outline" size="sm" asChild className="gap-1.5">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {icon}
        {children}
        <ExternalLink className="size-3.5 opacity-60" aria-hidden="true" />
      </a>
    </Button>
  );
}

interface DetailHeroProps {
  /** Lucide icon for the brand tile. Tile is omitted when neither icon nor image is set. */
  icon?: ReactNode;
  /** Artwork URL (already sanitized) — replaces the gradient tile background. */
  image?: string | null;
  /** Mono primary-colored kicker above the title (e.g. "NIP-01"). */
  kicker?: ReactNode;
  title: ReactNode;
  /** Inline element next to the title (e.g. a tier badge). */
  titleAside?: ReactNode;
  /** Muted line under the title (identifier, report summary, …). */
  subtitle?: ReactNode;
  /** Badge row. */
  badges?: ReactNode;
  /** Lead paragraph. */
  description?: ReactNode;
  /** Author/timestamp row. */
  meta?: ReactNode;
  /** Primary action, left-aligned in the action row (Approve, Open app, …). */
  primaryAction?: ReactNode;
  /** Secondary actions, grouped right (Edit, Fork, external links, …). */
  actions?: ReactNode;
  /** Extra free-form hero content (fork notes, …), rendered before the action row. */
  children?: ReactNode;
  className?: string;
}

/** Shared hero shell for detail pages — one branding/shape for NIPs, repos, and apps. */
export function DetailHero({
  icon,
  image,
  kicker,
  title,
  titleAside,
  subtitle,
  badges,
  description,
  meta,
  primaryAction,
  actions,
  children,
  className,
}: DetailHeroProps) {
  const hasTile = Boolean(icon || image);

  return (
    <header className={cn('space-y-4', className)}>
      <div className={cn(hasTile && 'flex items-start gap-4')}>
        {hasTile && <HeroTile icon={icon} image={image} />}
        <div className="min-w-0 flex-1 space-y-1">
          {kicker && <p className="font-mono text-sm text-primary">{kicker}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            {titleAside}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}

      {description && (
        <p className="max-w-prose break-words text-lg leading-relaxed text-muted-foreground">{description}</p>
      )}

      {meta && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {meta}
        </div>
      )}

      {children}

      {(primaryAction || actions) && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-4',
            primaryAction ? 'justify-between' : 'justify-start',
          )}
        >
          {primaryAction}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </header>
  );
}
