import { Link } from 'react-router-dom';
import { Blocks, Link2, Pencil, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useApps } from '@/hooks/useApps';
import type { AppInfo } from '@/lib/apps';

/**
 * Owner-facing nudge to link a NIP, repo, or zapstore listing to an app
 * listing (kind 31990). The NIP-89 listing is the nexus tying these entities
 * together, so we surface a contextual CTA on the entity's detail page that
 * deep-links into the submit/edit wizard with the reference pre-selected.
 *
 * Visibility rules:
 * - `repo` / `customNip` — shown only to the entity's owner.
 * - `officialNip` — official NIPs have no owner, so it's shown to any logged-in
 *   user ("built an app implementing this? link it").
 *
 * In every case the nudge hides itself once the current user already has an app
 * listing referencing the entity, so creators aren't nagged after linking.
 */
type LinkTarget =
  | { kind: 'repo'; address: string; ownerPubkey: string; relayHint?: string; label: string }
  | { kind: 'customNip'; address: string; ownerPubkey: string; relayHint?: string; label: string }
  | { kind: 'officialNip'; number: string; label: string };

interface LinkAppNudgeProps {
  target: LinkTarget;
  /**
   * Apps already linking this entity (from useAppsForRepo / useAppsForNip).
   * Used to detect whether the current user has already linked it.
   */
  linkedApps?: AppInfo[];
}

/** The query string that pre-selects this reference in the submit/edit wizard. */
function refQuery(target: LinkTarget): string {
  const params = new URLSearchParams();
  switch (target.kind) {
    case 'repo':
      params.set('repo', target.address);
      if (target.relayHint) params.set('relay', target.relayHint);
      break;
    case 'customNip':
      params.set('nip', target.address);
      if (target.relayHint) params.set('relay', target.relayHint);
      break;
    case 'officialNip':
      params.set('officialNip', target.number);
      break;
  }
  return params.toString();
}

/** Deep-link to the submit wizard with this reference pre-selected. */
function submitHref(target: LinkTarget): string {
  return `/apps/submit?${refQuery(target)}`;
}

/** Deep-link to the edit wizard, merging this reference into an existing app. */
function editHref(naddr: string, target: LinkTarget): string {
  return `/apps/edit/${naddr}?${refQuery(target)}`;
}

export function LinkAppNudge({ target, linkedApps = [] }: LinkAppNudgeProps) {
  const { user } = useCurrentUser();

  const isEntityOwner = target.kind !== 'officialNip' && user?.pubkey === target.ownerPubkey;
  const eligible = target.kind === 'officialNip' ? Boolean(user) : isEntityOwner;

  // The current user's own app listings — to offer "add it to an existing app"
  // and to know whether they've already linked this entity.
  const myApps = useApps({
    authors: user ? [user.pubkey] : undefined,
    requireFullMetadata: false,
    enabled: eligible,
  });

  if (!eligible) return null;

  // Already linked by the current user? Don't nag.
  const alreadyLinked = linkedApps.some((app) => app.pubkey === user!.pubkey);
  if (alreadyLinked) return null;

  // Wait for the listings query so we can choose the right CTA without flicker.
  if (myApps.isLoading) return null;

  const ownApps = myApps.data ?? [];
  const noun =
    target.kind === 'officialNip' ? 'NIP' : target.kind === 'customNip' ? 'NIP' : 'repository';

  const blurb =
    target.kind === 'officialNip'
      ? `Built an app that implements ${target.label}? Link it to your app listing so people can discover it here.`
      : `Connect ${target.label} to one of your apps. App listings tie your NIPs, repos, and releases together for discovery.`;

  return (
    <Card className="border-2 border-dashed border-primary/40 bg-primary/[0.03]">
      <CardContent className="space-y-3 py-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-primary" aria-hidden="true" />
          Link an app listing
        </div>
        <p className="text-sm text-muted-foreground">{blurb}</p>

        <div className="flex flex-col gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link to={submitHref(target)}>
              <PlusCircle className="size-4" aria-hidden="true" />
              Create an app listing
            </Link>
          </Button>

          {ownApps.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Or add this {noun} to an existing listing by editing it:
            </p>
          )}
          {ownApps.slice(0, 3).map((app) => (
            <Button
              key={app.address}
              asChild
              size="sm"
              variant="outline"
              className="justify-start gap-2"
            >
              <Link to={editHref(app.naddr, target)}>
                <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                  {app.picture ? (
                    <img src={app.picture} alt="" className="size-full object-cover" />
                  ) : (
                    <Blocks className="size-3 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{app.name}</span>
                <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default LinkAppNudge;
