import { useState } from 'react';
import {
  ChevronDown,
  Info,
  Loader2,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSubmitAppReview } from '@/hooks/useSubmitAppReview';
import { useToast } from '@/hooks/useToast';
import type { AppInfo } from '@/lib/apps';
import { TIERS, TIER_ORDER, TRACKED_NIPS, type CompatTier } from '@/lib/appReviews';
import { TIER_ICONS } from '@/lib/tierIcons';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Inline SVG dot used as a perfectly centered tier indicator inside buttons. */
function TierDotIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
    </svg>
  );
}

/**
 * ProtonDB-style report submission: rate how well each tracked NIP works in
 * the app, optionally with a written note per NIP, published as kind 31986
 * Borkstr-compatible compatibility reports.
 */
export function AppReviewForm({ app }: { app: AppInfo }) {
  const { user } = useCurrentUser();
  const { submitBatchReviews, isPending } = useSubmitAppReview();
  const { toast } = useToast();

  const [ratings, setRatings] = useState<Record<string, CompatTier>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const ratedCount = Object.keys(ratings).length;

  const setRating = (nipId: string, tier: CompatTier) => {
    setRatings((prev) => {
      if (prev[nipId] === tier) {
        const next = { ...prev };
        delete next[nipId];
        return next;
      }
      return { ...prev, [nipId]: tier };
    });
  };

  const clearAll = () => {
    setRatings({});
    setComments({});
    setExpandedComment(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (ratedCount === 0) {
      toast({
        title: 'Nothing to submit',
        description: 'Rate at least one NIP before submitting.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const reviews = Object.entries(ratings).map(([nip, tier]) => ({
        nip,
        tier,
        content: comments[nip]?.trim() || '',
      }));

      await submitBatchReviews({
        appAddress: app.address,
        appPubkey: app.pubkey,
        reviews,
      });

      toast({
        title: 'Reports submitted',
        description: `Published ${reviews.length} compatibility report${reviews.length > 1 ? 's' : ''}.`,
      });

      clearAll();
    } catch (err) {
      toast({
        title: 'Failed to submit',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Submit Reports</CardTitle>
          {ratedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{ratedCount} rated</span>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" aria-hidden="true" />
                Clear
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Rate how well each NIP works in this app. You can rate as many as you like.
        </p>
      </CardHeader>
      <CardContent>
        {!user ? (
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Log in with Nostr to submit compatibility reports.
            </p>
            <LoginArea className="mx-auto max-w-60" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Rating guide */}
            <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Info className="size-3.5" aria-hidden="true" />
                  <span>How to rate</span>
                  <ChevronDown
                    className={cn('size-3 transition-transform', guideOpen && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
                  {TIER_ORDER.map((tierId) => {
                    const tier = TIERS[tierId];
                    const Icon = TIER_ICONS[tierId];
                    return (
                      <div key={tierId} className="flex items-start gap-2.5">
                        <Icon className="mt-0.5 size-4 shrink-0" style={{ color: tier.color }} aria-hidden="true" />
                        <div className="text-xs">
                          <span className="font-semibold" style={{ color: tier.color }}>
                            {tier.label}
                          </span>
                          <span className="text-muted-foreground"> — {tier.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* NIP rating grid */}
            <div className="overflow-hidden rounded-lg border border-border/50">
              {/* Legend header */}
              <div className="flex items-center gap-2 border-b border-border/30 bg-muted/30 px-3 py-2.5">
                <span className="hidden flex-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
                  NIP
                </span>
                <div className="mr-2.5 flex flex-1 gap-1.5 sm:flex-none sm:shrink-0">
                  {TIER_ORDER.map((t) => {
                    const Icon = TIER_ICONS[t];
                    return (
                      <span
                        key={t}
                        className="inline-flex flex-1 items-center justify-center sm:w-10 sm:flex-none"
                        style={{ color: TIERS[t].color }}
                        title={TIERS[t].label}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                    );
                  })}
                </div>
                {/* Spacer for comment button alignment */}
                <span className="w-8 shrink-0" />
              </div>

              {/* NIP rows */}
              <div className="max-h-[420px] overflow-y-auto">
                {TRACKED_NIPS.map((nip, i) => {
                  const selected = ratings[nip.id];
                  const isCommentOpen = expandedComment === nip.id;
                  const hasComment = !!comments[nip.id]?.trim();

                  return (
                    <div key={nip.id}>
                      <div
                        className={cn(
                          'px-3 py-2 transition-colors',
                          i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10',
                          selected && 'bg-primary/5',
                        )}
                      >
                        {/* NIP label — stacked on mobile */}
                        <div className="mb-1.5 flex items-center gap-2 sm:hidden">
                          <span className="font-mono text-xs text-muted-foreground">
                            {nip.id.replace('nip-', '').toUpperCase()}
                          </span>
                          <span className="truncate text-sm">{nip.name}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* NIP label — desktop */}
                          <span className="hidden w-8 shrink-0 font-mono text-xs text-muted-foreground sm:block">
                            {nip.id.replace('nip-', '').toUpperCase()}
                          </span>
                          <span className="hidden min-w-0 flex-1 truncate text-sm sm:block">
                            {nip.name}
                            <span className="ml-2 text-xs text-muted-foreground">{nip.description}</span>
                          </span>

                          {/* Tier buttons */}
                          <div className="flex flex-1 gap-1.5 sm:flex-none sm:shrink-0">
                            {TIER_ORDER.map((tierId) => {
                              const tier = TIERS[tierId];
                              const isSelected = selected === tierId;
                              return (
                                <button
                                  key={tierId}
                                  type="button"
                                  onClick={() => setRating(nip.id, tierId)}
                                  className={cn(
                                    'h-9 flex-1 rounded-lg transition-all sm:w-10 sm:flex-none',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    isSelected
                                      ? 'shadow-sm ring-2 ring-offset-1 ring-offset-background'
                                      : 'opacity-25 hover:opacity-60',
                                  )}
                                  style={
                                    isSelected
                                      ? ({
                                          backgroundColor: tier.color,
                                          color: '#fff',
                                          '--tw-ring-color': tier.color,
                                        } as React.CSSProperties)
                                      : { backgroundColor: tier.color }
                                  }
                                  title={`${tier.label} — ${tier.description}`}
                                  aria-pressed={isSelected}
                                  aria-label={`Rate ${nip.name} as ${tier.label}`}
                                >
                                  <TierDotIcon size={isSelected ? 18 : 14} className="mx-auto" />
                                </button>
                              );
                            })}
                          </div>

                          {/* Comment toggle */}
                          <button
                            type="button"
                            onClick={() => setExpandedComment((prev) => (prev === nip.id ? null : nip.id))}
                            className={cn(
                              'inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              isCommentOpen || hasComment
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground/40 hover:bg-muted/50 hover:text-muted-foreground',
                            )}
                            title="Add comment"
                            aria-label={`Add comment for ${nip.name}`}
                          >
                            <MessageSquare className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {/* Inline comment area */}
                      {isCommentOpen && (
                        <div className="px-3 pb-2.5 pt-0.5">
                          <Textarea
                            placeholder={`Your experience with ${nip.name}...`}
                            value={comments[nip.id] || ''}
                            onChange={(e) =>
                              setComments((prev) => ({ ...prev, [nip.id]: e.target.value }))
                            }
                            rows={2}
                            className="resize-none text-sm"
                            autoFocus
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || ratedCount === 0}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    Publishing {ratedCount} report{ratedCount > 1 ? 's' : ''}...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 size-4" aria-hidden="true" />
                    Submit {ratedCount} report{ratedCount !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default AppReviewForm;
