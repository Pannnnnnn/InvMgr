'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionary, type Lang } from './dictionary';

const LANG_KEY = 'factorylens.lang';

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Thai-first, English-secondary UI language. Persisted per-browser
 * (localStorage) so an operator's choice sticks across visits without
 * needing an account. Defaults to Thai since most floor workers aren't
 * fluent in English — see the dictionary's comment for context.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('th');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'th' || stored === 'en') setLangState(stored);
    } catch {
      // localStorage unavailable — fall back to default 'th' silently.
    }
  }, []);

  function setLang(next: Lang) {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => {
        let str = dictionary[lang][key] ?? dictionary.en[key] ?? key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
          }
        }
        return str;
      },
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>.');
  return ctx;
}
