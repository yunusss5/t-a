import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider, useI18n } from './index';

function LanguageProbe() {
  const { language, languages, setLanguage, t } = useI18n();

  return (
    <div>
      <span>{t('nav.allTools')}</span>
      <select
        aria-label={t('language.select')}
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
      >
        {languages.map(({ code, name }) => (
          <option key={code} value={code}>{name}</option>
        ))}
      </select>
    </div>
  );
}

describe('internationalization', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  it('defaults to English and persists the chosen locale', async () => {
    render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    );

    expect(screen.getByText('All tools')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });

    expect(screen.getByText('Todas las herramientas')).toBeTruthy();
    await waitFor(() => {
      expect(window.localStorage.getItem('vf.language')).toBe('es');
      expect(document.documentElement.lang).toBe('es');
    });
  });

  it('restores the saved locale and applies right-to-left direction', async () => {
    window.localStorage.setItem('vf.language', 'ar');

    render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    );

    expect(screen.getByText('كل الأدوات')).toBeTruthy();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
    });
  });

  it('falls back to English for untranslated keys and invalid saved locales', () => {
    window.localStorage.setItem('vf.language', 'xx');

    render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    );

    expect(screen.getByRole('combobox').value).toBe('en');
  });
});
