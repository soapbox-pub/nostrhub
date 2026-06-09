import { useCallback, useMemo } from 'react';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Read and manage the user's configured "Nostr Experts" (hex pubkeys).
 *
 * Experts anchor the app's trust model: their NIP approvals are counted for
 * ranking, and their follow lists derive the community author set. The list is
 * persisted in `AppConfig.experts` via local storage.
 */
export function useExperts() {
  const { config, updateConfig } = useAppContext();

  const experts = useMemo(() => config.experts ?? [], [config.experts]);
  const expertSet = useMemo(() => new Set(experts), [experts]);

  const isExpert = useCallback((pubkey: string) => expertSet.has(pubkey), [expertSet]);

  const addExpert = useCallback(
    (pubkey: string) => {
      if (!pubkey) return;
      updateConfig((current) => {
        const list = current.experts ?? experts;
        if (list.includes(pubkey)) return current;
        return { ...current, experts: [...list, pubkey] };
      });
    },
    [updateConfig, experts],
  );

  const removeExpert = useCallback(
    (pubkey: string) => {
      updateConfig((current) => {
        const list = current.experts ?? experts;
        return { ...current, experts: list.filter((p) => p !== pubkey) };
      });
    },
    [updateConfig, experts],
  );

  const toggleExpert = useCallback(
    (pubkey: string) => {
      if (expertSet.has(pubkey)) {
        removeExpert(pubkey);
      } else {
        addExpert(pubkey);
      }
    },
    [expertSet, addExpert, removeExpert],
  );

  const setExperts = useCallback(
    (pubkeys: string[]) => {
      updateConfig((current) => ({ ...current, experts: Array.from(new Set(pubkeys)) }));
    },
    [updateConfig],
  );

  return { experts, expertSet, isExpert, addExpert, removeExpert, toggleExpert, setExperts };
}
