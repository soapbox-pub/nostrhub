import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type NostrSigner, NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { NUser, useNostrLogin } from '@nostrify/react/login';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays, SEARCH_RELAYS } from '@/lib/appRelays';
import { DEFAULT_GRASP_SERVERS } from '@/lib/git';

interface NostrProviderProps {
  children: React.ReactNode;
}

/**
 * NIP-34 git event kinds. These are routed to GRASP servers (Nostr relays that
 * double as git hosts) in addition to the normal relay set, so a GRASP server
 * sees a repo's announcement/state and provisions + serves the git data.
 */
const GIT_KINDS = [
  30617, // repository announcement
  30618, // repository state
  1617, // patch
  1621, // issue
];

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();
  const { logins } = useNostrLogin();

  const queryClient = useQueryClient();

  // Use refs so the pool callbacks always see the latest data without
  // recreating the pool. The refs are written from effects (never during
  // render) to satisfy React's purity rules.
  //
  // `effectiveRelays` is the merged relay set derived from the app-default
  // relays and the user's NIP-65 list, gated by `useAppRelays`/`useUserRelays`.
  const effectiveRelaysRef = useRef(
    getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays),
  );

  // Stable ref to the current user's signer for NIP-42 AUTH.
  // The `open()` callback reads from this ref when a relay sends an AUTH
  // challenge, so it always uses the latest signer without recreating the pool.
  const signerRef = useRef<NostrSigner | undefined>(undefined);

  // Lazily create the pool once, via useState's initializer. This keeps
  // the render body pure (no ref writes) while guaranteeing a single
  // NPool instance per provider. The initializer runs exactly once at
  // mount, so reading refs inside its closures is safe.
  // eslint-disable-next-line react-hooks/refs
  const [pool] = useState<NPool>(() => new NPool({
    open(url: string) {
      return new NRelay1(url, {
        // NIP-42: Respond to relay AUTH challenges by signing a kind
        // 22242 ephemeral event with the current user's signer.
        auth: async (challenge: string) => {
          const signer = signerRef.current;
          if (!signer) {
            throw new Error('AUTH failed: no signer available (user not logged in)');
          }
          return signer.signEvent({
            kind: 22242,
            content: '',
            tags: [
              ['relay', url],
              ['challenge', challenge],
            ],
            created_at: Math.floor(Date.now() / 1000),
          });
        },
      });
    },
    reqRouter(filters: NostrFilter[]) {
      const routes = new Map<string, NostrFilter[]>();

      // NIP-50 search queries must go to relays that support the `search`
      // capability (the user's general read relays may not implement it).
      if (filters.some((f) => 'search' in f)) {
        return new Map(SEARCH_RELAYS.map((url) => [url, filters]));
      }

      // Route to all read relays
      const readRelays = effectiveRelaysRef.current.relays
        .filter(r => r.read)
        .map(r => r.url);

      for (const url of readRelays) {
        routes.set(url, filters);
      }

      // Git-only queries also fan out to the GRASP servers, which carry the
      // NIP-34 traffic general relays usually don't.
      if (filters.length > 0 && filters.every((f) => f.kinds?.every((k) => GIT_KINDS.includes(k)))) {
        for (const url of DEFAULT_GRASP_SERVERS) {
          routes.set(url, filters);
        }
      }

      return routes;
    },
    eventRouter(event: NostrEvent) {
      // Get write relays from the effective relay set
      const writeRelays = effectiveRelaysRef.current.relays
        .filter(r => r.write)
        .map(r => r.url);

      const allRelays = new Set<string>(writeRelays);

      // Git events must reach the GRASP servers so they provision and serve
      // the repository, not just the user's general write relays.
      if (GIT_KINDS.includes(event.kind)) {
        for (const url of DEFAULT_GRASP_SERVERS) {
          allRelays.add(url);
        }
      }

      return [...allRelays];
    },
    eoseTimeout: 200,
  }));

  // Derive the current signer from the active login. This mirrors the
  // logic in useCurrentUser but avoids a circular dependency (useCurrentUser
  // depends on NostrContext which we are providing here).
  const currentLogin = logins[0];
  const currentSigner = useMemo(() => {
    if (!currentLogin) return undefined;
    try {
      switch (currentLogin.type) {
        case 'nsec':
          return NUser.fromNsecLogin(currentLogin).signer;
        case 'bunker':
          return NUser.fromBunkerLogin(currentLogin, pool).signer;
        case 'extension':
          return NUser.fromExtensionLogin(currentLogin).signer;
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }, [currentLogin, pool]);

  // Keep the ref in sync so the AUTH callback always sees the latest signer.
  // Writing refs from an effect (not during render) satisfies purity rules.
  useEffect(() => {
    signerRef.current = currentSigner;
  }, [currentSigner]);

  // Recompute the effective relay set and invalidate Nostr queries when the
  // relay config (NIP-65 list or the app/user relay toggles) changes.
  useEffect(() => {
    effectiveRelaysRef.current = getEffectiveRelays(
      config.relayMetadata,
      config.useAppRelays,
      config.useUserRelays,
    );
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [config.relayMetadata, config.useAppRelays, config.useUserRelays, queryClient]);

  const contextValue = useMemo(() => ({ nostr: pool }), [pool]);

  return (
    <NostrContext.Provider value={contextValue}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;
