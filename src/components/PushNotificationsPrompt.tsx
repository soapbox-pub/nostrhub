import { BellRing, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/useToast';

/** What push covers, said the same way wherever it's offered. */
const PUSH_SUMMARY =
  'New issues and pull requests on your repos, replies and state changes in threads you’re in, mentions, and activity on your NIPs, apps, and articles.';

function usePushToggle() {
  const push = usePushNotifications();
  const { toast } = useToast();

  const setEnabled = (next: boolean) => {
    const mutation = next ? push.enable : push.disable;
    mutation.mutate(undefined, {
      onSuccess: () => toast({
        title: next ? 'Push notifications on' : 'Push notifications off',
        description: next ? 'You’ll be notified on this device, even when NostrHub is closed.' : undefined,
      }),
      onError: (err) => toast({
        variant: 'destructive',
        title: next ? 'Couldn’t turn on push notifications' : 'Couldn’t turn off push notifications',
        description: err instanceof Error ? err.message : String(err),
      }),
    });
  };

  const pending = push.enable.isPending || push.disable.isPending;
  return { ...push, setEnabled, pending };
}

/**
 * An offer to turn push on, shown above the notification list when NostrHub
 * runs inside a napp host and push is off. Renders nothing otherwise.
 */
export function PushNotificationsPrompt() {
  const { user } = useCurrentUser();
  const { supported, enabled, isLoading, ready, pending, setEnabled } = usePushToggle();

  if (!user || !supported || isLoading || enabled) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="shrink-0 self-start rounded-full bg-primary/10 p-2 text-primary" aria-hidden="true">
          <BellRing className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">Get notified on this device</p>
          <p className="text-sm text-muted-foreground">{PUSH_SUMMARY}</p>
        </div>
        <Button onClick={() => setEnabled(true)} disabled={!ready || pending} className="shrink-0">
          {pending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
          Turn on
        </Button>
      </CardContent>
    </Card>
  );
}

/** The on/off switch for push, for the Settings page. */
export function PushNotificationsSwitch() {
  const { supported, enabled, isLoading, ready, pending, setEnabled } = usePushToggle();
  if (!supported) return null;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor="push-toggle" className="text-sm font-medium">
          Push notifications
        </Label>
        <p className="text-sm text-muted-foreground">{PUSH_SUMMARY}</p>
      </div>
      <Switch
        id="push-toggle"
        checked={enabled}
        disabled={isLoading || pending || (!enabled && !ready)}
        onCheckedChange={setEnabled}
      />
    </div>
  );
}
