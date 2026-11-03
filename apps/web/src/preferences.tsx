import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { en, fr } from './i18n';
import { PreferencesContext as Context } from './preferences-context';
import type { Preferences } from './preferences-context';

const key = 'orkobi.preferences';
function load(): Preferences {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (typeof saved === 'object' && saved !== null) {
      const value = saved as Record<string, unknown>;
      return {
        locale: value.locale === 'en' ? 'en' : 'fr',
        theme: value.theme === 'dark' || value.theme === 'light' ? value.theme : 'system',
      };
    }
  } catch {
    /* Stockage bloqué ou ancien format : garder une interface utilisable. */
  }
  return { locale: 'fr', theme: 'system' };
}
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(load);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme;
      document.documentElement.lang = preferences.locale;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          'content',
          document.documentElement.dataset.theme === 'dark' ? '#151b26' : '#f5f7fa',
        );
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
      setSaved(true);
    } catch {
      setSaved(false);
    }
    return () => media.removeEventListener('change', apply);
  }, [preferences]);
  return (
    <Context
      value={{
        ...preferences,
        saved,
        messages: preferences.locale === 'fr' ? fr : en,
        setLocale: (locale) => setPreferences((current) => ({ ...current, locale })),
        setTheme: (theme) => setPreferences((current) => ({ ...current, theme })),
      }}
    >
      {children}
    </Context>
  );
}
