/* eslint react-refresh/only-export-components: off */

import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import { en } from './locales/en';
import { es } from './locales/es';
import { zh } from './locales/zh';
import { hi } from './locales/hi';
import { ar } from './locales/ar';
import { fr } from './locales/fr';
import { bn } from './locales/bn';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { id } from './locales/id';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'ar', name: 'العربية' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

const STORAGE_KEY = 'vf.language';
const resources = { en, zh, hi, es, fr, ar, bn, pt, ru, id };
const I18nContext = createContext({
  language: 'en',
  setLanguage: () => {},
  languages: LANGUAGES,
  t: (key, params = {}) =>
    Object.entries(params).reduce(
      (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
      en[key] ?? key,
    ),
});

function getInitialLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some(({ code }) => code === saved) ? saved : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The selected locale still works for the current visit when storage is unavailable.
    }
  }, [language]);

  const value = useMemo(() => {
    const t = (key, params = {}) => {
      const message = resources[language]?.[key] ?? en[key] ?? key;
      return Object.entries(params).reduce(
        (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
        message,
      );
    };

    return { language, setLanguage, languages: LANGUAGES, t };
  }, [language]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(I18nContext);
}
