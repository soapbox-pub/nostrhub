import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { APP_HANDLER_KIND, type AppInfo } from '@/lib/apps';

/**
 * Fetches all kind-7 "❤️" reactions targeting a given app's addressable event,
 * and exposes a `like` mutation the logged-in user can trigger.
 *
 * Reactions target addressable events via an `a` tag (NIP-25):
 *   ["a", "31990:<pubkey>:<d-tag>"]
 * plus an `e` tag for the specific event revision.
 */
export function useAppLikes(app: AppInfo) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const queryKey = ['app-likes', app.address];

  const { data: reactions = [] } = useQuery({
    queryKey,
    queryFn: (c) =>
      nostr.query(
        [{ kinds: [7], '#a': [app.address], limit: 500 }],
        { signal: c.signal },
      ),
    staleTime: 30_000,
  });

  // Hearts only: content "❤️", "+", or empty string
  const heartReactions = reactions.filter((e) =>
    e.content === '❤️' || e.content === '+' || e.content === '',
  );

  const likeCount = heartReactions.length;
  const likedByMe = user
    ? heartReactions.some((e) => e.pubkey === user.pubkey)
    : false;

  const { mutate: like, isPending } = useMutation({
    mutationFn: () =>
      publishEvent({
        kind: 7,
        content: '❤️',
        tags: [
          ['a', app.address],
          ['e', app.event.id],
          ['p', app.pubkey],
          ['k', String(APP_HANDLER_KIND)],
        ],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { likeCount, likedByMe, like, isPending };
}
