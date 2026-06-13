import { ReactNode, useLayoutEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme } from '@/contexts/AppContext';
import { AppConfigSchema } from '@/lib/schemas';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence.
  // Each top-level field is validated individually with safeParse, so a single
  // invalid/incomplete field doesn't reset the whole config to defaults.
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null) return {};

        const result: Partial<AppConfig> = {};
        for (const key of Object.keys(parsed)) {
          const fieldSchema = AppConfigSchema.shape[key as keyof typeof AppConfigSchema.shape];
          if (fieldSchema) {
            const fieldResult = fieldSchema.safeParse(parsed[key]);
            if (fieldResult.success) {
              (result as Record<string, unknown>)[key] = fieldResult.data;
            }
          }
        }
        return result;
      }
    }
  );

  const updateConfig = (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
    setConfig(updater);
  };

  const config = { ...defaultConfig, ...rawConfig };

  const appContextValue: AppContextType = {
    config,
    updateConfig,
  };

  // Toggle the `.dark` class for the built-in light/dark/system modes. The
  // "ditto" theme is handled separately by <DittoThemeInjector/>, which sets the
  // class based on the user's profile-theme background luminance.
  useApplyTheme(config.theme);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Apply the built-in theme mode by toggling the `.dark` class on <html>.
 * For "system", resolves via prefers-color-scheme with a live listener.
 * For "ditto", does nothing here — DittoThemeInjector owns the class while a
 * profile theme is loaded.
 */
function useApplyTheme(theme: Theme) {
  useLayoutEffect(() => {
    const root = document.documentElement;

    function apply() {
      if (theme === 'ditto') return; // owned by DittoThemeInjector
      const dark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', dark);
    }

    apply();

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);
}
