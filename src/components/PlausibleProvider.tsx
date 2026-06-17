import { ReactNode, useEffect, useRef } from 'react';
import { useAppContext } from '@/hooks/useAppContext';

interface PlausibleProviderProps {
  children: ReactNode;
}

/**
 * Reactively initializes Plausible Analytics from AppConfig.
 *
 * Analytics only load when BOTH conditions hold:
 *   1. A `plausibleDomain` is configured (baked in at build time via
 *      `VITE_PLAUSIBLE_DOMAIN`).
 *   2. The user has not opted out (`analyticsEnabled !== false`).
 *
 * Plausible's `init()` can only be called once per page load, so a ref guards
 * against re-initialization. A user who opts out after the tracker has already
 * loaded stops sending events on the next full page load.
 */
export function PlausibleProvider({ children }: PlausibleProviderProps) {
  const { config } = useAppContext();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    if (!config.plausibleDomain) return;
    if (!config.analyticsEnabled) return;

    initializedRef.current = true;

    import('@plausible-analytics/tracker')
      .then(({ init }) => {
        init({
          domain: config.plausibleDomain,
          ...(config.plausibleEndpoint && { endpoint: config.plausibleEndpoint }),
        });
      })
      .catch(console.error);
  }, [config.plausibleDomain, config.plausibleEndpoint, config.analyticsEnabled]);

  return <>{children}</>;
}
