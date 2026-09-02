// src/lib/seo.test.js
// What every page claims about itself. These records are consumed twice — by the
// runtime <head> and by the build step that writes the static HTML and sitemap —
// so a mistake here ships to crawlers rather than to a screen.

import { describe, expect, it } from 'vitest';
import {
  SITE,
  absoluteUrl,
  clampDescription,
  homeSeo,
  notFoundSeo,
  toolPath,
  toolSeo,
} from './seo';

const TOOL = {
  id: 'seo-studio',
  name: 'SEO Studio',
  tagline: 'Titles, descriptions and keywords from a transcript',
  description: 'Turn a transcript or a YouTube link into a full SEO package.',
};

describe('SITE', () => {
  it('has an absolute origin with no trailing slash', () => {
    expect(SITE.url).toMatch(/^https?:\/\//);
    expect(SITE.url.endsWith('/')).toBe(false);
  });
});

describe('absoluteUrl', () => {
  it('resolves a root-relative path against the configured origin', () => {
    expect(absoluteUrl('/tools/seo-studio')).toBe(`${SITE.url}/tools/seo-studio`);
  });

  it('adds the missing slash rather than producing a double origin', () => {
    expect(absoluteUrl('tools')).toBe(`${SITE.url}/tools`);
  });

  it('leaves an already absolute URL alone', () => {
    expect(absoluteUrl('https://example.com/x')).toBe('https://example.com/x');
  });

  it('defaults to the origin itself', () => {
    expect(absoluteUrl()).toBe(`${SITE.url}/`);
  });
});

describe('clampDescription', () => {
  it('collapses whitespace and leaves a short description intact', () => {
    expect(clampDescription('  two   words\nhere ')).toBe('two words here');
  });

  it('never exceeds the limit and never cuts a word in half', () => {
    const long = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike';
    const clamped = clampDescription(long, 40);

    expect(clamped.length).toBeLessThanOrEqual(41); // 40 plus the ellipsis
    expect(clamped.endsWith('…')).toBe(true);
    // Every word that survived is a whole word from the original.
    clamped
      .replace('…', '')
      .split(' ')
      .forEach((word) => expect(long.split(' ')).toContain(word));
  });

  it('treats a missing description as an empty one', () => {
    expect(clampDescription(undefined)).toBe('');
    expect(clampDescription(null)).toBe('');
  });
});

describe('homeSeo', () => {
  it('states the real tool count rather than a hard-coded number', () => {
    expect(homeSeo(23).title).toContain('23 free creator tools');
  });

  it('reads correctly when the count is unknown, with no double space', () => {
    const title = homeSeo(0).title;
    expect(title).not.toMatch(/ {2}/);
    expect(title).toContain('free creator tools');
  });

  it('carries a WebSite and a CollectionPage, both with an absolute url', () => {
    const types = homeSeo(23).jsonLd.map((node) => node['@type']);
    expect(types).toEqual(['WebSite', 'CollectionPage']);

    homeSeo(23).jsonLd.forEach((node) => {
      expect(node['@context']).toBe('https://schema.org');
      expect(node.url).toMatch(/^https?:\/\//);
    });
  });

  it('advertises a search action that points at the query the dashboard reads', () => {
    const [website] = homeSeo(1).jsonLd;
    expect(website.potentialAction.target.urlTemplate).toContain('?q={search_term_string}');
  });
});

describe('toolSeo', () => {
  it('builds a unique title and a canonical path per tool', () => {
    const record = toolSeo(TOOL);
    expect(record.title).toBe(`SEO Studio — free online tool | ${SITE.name}`);
    expect(record.path).toBe(toolPath(TOOL.id));
    expect(record.noindex).toBeUndefined();
  });

  it('falls back to the tagline when a tool has no description', () => {
    const record = toolSeo({ ...TOOL, description: '' });
    expect(record.description).toBe(TOOL.tagline);
  });

  it('describes the tool as free software with a breadcrumb back to the dashboard', () => {
    const [software, breadcrumb] = toolSeo(TOOL).jsonLd;

    expect(software['@type']).toBe('SoftwareApplication');
    expect(software.isAccessibleForFree).toBe(true);
    expect(software.offers.price).toBe('0');
    expect(software.url).toBe(`${SITE.url}/tools/${TOOL.id}`);

    expect(breadcrumb['@type']).toBe('BreadcrumbList');
    expect(breadcrumb.itemListElement.map((item) => item.position)).toEqual([1, 2]);
    expect(breadcrumb.itemListElement[1].name).toBe(TOOL.name);
  });
});

describe('notFoundSeo', () => {
  it('is the only record that asks not to be indexed', () => {
    const record = notFoundSeo();
    expect(record.noindex).toBe(true);
    expect(record.jsonLd).toEqual([]);
    expect(homeSeo(1).noindex).toBeUndefined();
  });
});
