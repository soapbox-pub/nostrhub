import { Link } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import { useDrafts } from '@/hooks/useDrafts';
import { draftResumeHref } from '@/lib/drafts';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ResumeDraftsBannerProps {
  /** Only count drafts whose wrapped event has this kind. */
  kind: number;
  /** Don't surface a draft we're already resuming. */
  currentSlug?: string | null;
}

/**
 * A subtle prompt shown on a create page when the user has saved drafts of the
 * relevant kind, giving them a one-click way to pick up where they left off.
 */
export function ResumeDraftsBanner({ kind, currentSlug }: ResumeDraftsBannerProps) {
  const { drafts } = useDrafts();

  const relevant = (drafts.data ?? []).filter(
    (d) => d.kind === kind && d.slug !== currentSlug,
  );
  if (relevant.length === 0) return null;

  // One draft: deep-link straight into it. Several: send them to the list.
  const single = relevant.length === 1 ? relevant[0] : null;
  const href = single ? draftResumeHref(single) : '/drafts';
  const label = single
    ? `Continue your draft “${single.title}”`
    : `You have ${relevant.length} saved drafts`;

  return (
    <Alert className="mb-6">
      <FileText className="size-4" />
      <AlertDescription className="flex w-full items-center justify-between gap-3">
        <span className="min-w-0 truncate">{label}</span>
        <Link
          to={href}
          className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary hover:underline"
        >
          {single ? 'Resume' : 'View drafts'}
          <ChevronRight className="size-4" />
        </Link>
      </AlertDescription>
    </Alert>
  );
}

export default ResumeDraftsBanner;
