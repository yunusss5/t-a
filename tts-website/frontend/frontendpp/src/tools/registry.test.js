// src/tools/registry.test.js
// The catalogue is read twice: by the app and, from Node, by the build step that
// writes sitemap.xml and one static HTML file per tool. A tool added to one file
// and not the other produces a route that 404s or a page nothing links to, and
// neither shows up in a screenshot — so it is checked here instead.

import { describe, expect, it } from 'vitest';
import { CATALOGUE, CATEGORIES } from './catalogue';
import { TOOLS, getTool, relatedTools, searchTools, toolsByCategory } from './registry';
import { clampDescription, toolSeo } from '../lib/seo';

const ACCENTS = ['violet', 'rose', 'amber', 'emerald', 'sky'];
const CATEGORY_IDS = CATEGORIES.map((category) => category.id);

describe('catalogue integrity', () => {
  it('has a unique, URL-safe id per tool', () => {
    const ids = CATALOGUE.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it('gives every tool an implementation, and ships no orphan implementations', () => {
    TOOLS.forEach((tool) => {
      expect(tool.component, `${tool.id} has no component`).toBeTruthy();
      expect(tool.icon, `${tool.id} has no icon`).toBeTruthy();
    });
    expect(TOOLS).toHaveLength(CATALOGUE.length);
  });

  it('places every tool in a real category with a real accent', () => {
    CATALOGUE.forEach((tool) => {
      expect(CATEGORY_IDS, `${tool.id} category`).toContain(tool.category);
      expect(ACCENTS, `${tool.id} accent`).toContain(tool.accent);
    });
  });

  it('leaves no category empty, since each one renders its own section', () => {
    CATEGORY_IDS.forEach((id) => expect(toolsByCategory(id).length).toBeGreaterThan(0));
  });

  it('gives each tool a distinct name and a tagline short enough for a card', () => {
    const names = CATALOGUE.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    CATALOGUE.forEach((tool) => expect(tool.tagline.length).toBeLessThanOrEqual(72));
  });

  it('carries search keywords so the palette can find a tool by what it does', () => {
    CATALOGUE.forEach((tool) => {
      expect(Array.isArray(tool.keywords), `${tool.id} keywords`).toBe(true);
      expect(tool.keywords.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('per-tool SEO records', () => {
  it('writes a meta description that fits a search snippet without being cut', () => {
    CATALOGUE.forEach((tool) => {
      const { description } = toolSeo(tool);
      // A snippet Google will truncate is a snippet ending mid-thought; a very
      // short one wastes the slot. Both are caught by comparing against the
      // unclamped source: an ellipsis here means the copy is too long.
      expect(description, `${tool.id} description was truncated`).toBe(
        clampDescription(tool.description),
      );
      expect(description.endsWith('…'), `${tool.id} description was truncated`).toBe(false);
      expect(description.length, `${tool.id} description too short`).toBeGreaterThanOrEqual(85);
    });
  });

  it('gives every page a unique title and canonical path', () => {
    const titles = CATALOGUE.map((tool) => toolSeo(tool).title);
    const paths = CATALOGUE.map((tool) => toolSeo(tool).path);

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(paths).size).toBe(paths.length);
    // Long titles get cut in the SERP; the suffix is short for that reason.
    titles.forEach((title) => expect(title.length).toBeLessThanOrEqual(70));
  });
});

describe('lookup helpers', () => {
  it('finds a tool by id and returns undefined for one that does not exist', () => {
    expect(getTool('seo-studio').name).toBe('SEO Content Studio');
    expect(getTool('nope')).toBeUndefined();
  });

  it('never suggests the page you are already on, and always fills the row', () => {
    CATALOGUE.forEach((tool) => {
      const related = relatedTools(tool, 4);
      expect(related).toHaveLength(4);
      expect(related.map((item) => item.id)).not.toContain(tool.id);
      expect(new Set(related.map((item) => item.id)).size).toBe(4);
    });
  });

  it('prefers siblings from the same category', () => {
    const [first] = relatedTools(getTool('word-counter'));
    expect(first.category).toBe('text');
  });

  it('tolerates a missing tool rather than throwing on an unknown route', () => {
    expect(relatedTools(undefined)).toEqual([]);
  });
});

describe('searchTools', () => {
  it('returns everything for an empty query', () => {
    expect(searchTools('   ')).toHaveLength(CATALOGUE.length);
  });

  it('matches on a keyword the name never mentions', () => {
    // "flesch" only exists in content-analyzer's keywords.
    expect(searchTools('flesch').map((tool) => tool.id)).toEqual(['content-analyzer']);
  });

  it('requires every term, so a second word narrows rather than widens', () => {
    const one = searchTools('audio');
    const two = searchTools('audio speed');
    expect(two.length).toBeLessThanOrEqual(one.length);
    expect(two.map((tool) => tool.id)).toContain('audio-studio');
  });

  it('ignores case and surrounding space', () => {
    expect(searchTools('  QR CODE  ').map((tool) => tool.id)).toContain('qr-generator');
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchTools('zzzznotatool')).toEqual([]);
  });
});
