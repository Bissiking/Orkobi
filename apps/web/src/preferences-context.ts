import { createContext, useContext } from 'react';
import type { Locale, Messages } from './i18n';

export type Theme = 'light' | 'dark' | 'system';
export interface Preferences {
  readonly locale: Locale;
  readonly theme: Theme;
}
export interface PreferencesContextValue extends Preferences {
  readonly messages: Messages;
  readonly saved: boolean;
  readonly setLocale: (locale: Locale) => void;
  readonly setTheme: (theme: Theme) => void;
}
export const PreferencesContext = createContext<PreferencesContextValue | null>(null);
export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('PreferencesProvider required.');
  return value;
}
