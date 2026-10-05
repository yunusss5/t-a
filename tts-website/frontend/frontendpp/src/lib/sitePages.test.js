import { describe, expect, it } from 'vitest';
import { SITE_PAGES, sitePagePath, sitePageSeo } from './sitePages';

describe('site information pages', () => {
  it('defines the standard public information pages with unique crawlable paths', () => {
    expect(SITE_PAGES.map((page) => page.slug)).toEqual(['about', 'privacy', 'terms']);
    expect(new Set(SITE_PAGES.map(sitePagePath)).size).toBe(SITE_PAGES.length);

    SITE_PAGES.forEach((page) => {
      const seo = sitePageSeo(page);
      expect(seo.path).toBe(`/${page.slug}`);
      expect(seo.title).toContain(page.title);
      expect(seo.description.length).toBeGreaterThan(40);
      expect(page.sections.length).toBeGreaterThan(0);
    });
  });
});
