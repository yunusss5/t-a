// src/lib/seo.js
// ---------------------------------------------------------------------------
// One place that decides what every page claims about itself.
//
// Plain data and pure functions, no imports: the build step that emits
// sitemap.xml and the per-route static HTML imports this from Node, so the
// crawlable HTML and the client-rendered <head> can never disagree.
//
// Set SITE_URL (build env) or VITE_SITE_URL to the deployed origin. Canonicals
// and Open Graph URLs must be absolute, and guessing from window.location would
// mint a different canonical for every preview deployment.
// ---------------------------------------------------------------------------

const ENV_URL =
  (typeof process !== 'undefined' && process.env && process.env.SITE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SITE_URL) ||
  '';

export const SITE = {
  name: 'VoiceForge',
  fullName: 'VoiceForge — Creator Toolkit',
  url: String(ENV_URL || 'https://voiceforge-toolkit.vercel.app').replace(/\/+$/, ''),
  locale: 'en',
  language: 'en',
  ogImage: '/og-cover.png',
  description:
    'A free toolkit for creators: turn a transcript or YouTube link into SEO titles, descriptions, hashtags and keywords, then narrate, subtitle and resize what you publish.',
};

/** Resolve a root-relative path against the configured origin. */
export function absoluteUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;
}

export const toolPath = (id) => `/tools/${id}`;

/** Trim to a sensible snippet length without cutting a word in half. */
export function clampDescription(text, max = 158) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`;
}

/** SEO record for the dashboard. */
export function homeSeo(toolCount = 0) {
  return {
    title: `${SITE.name} — ${toolCount || ''} free creator tools for SEO, voice and video`.replace(
      /\s+/g,
      ' ',
    ),
    description: clampDescription(SITE.description),
    path: '/',
    jsonLd: [websiteJsonLd(), collectionJsonLd()],
  };
}

/** SEO record for one tool page. */
export function toolSeo(tool) {
  return {
    title: `${tool.name} — free online tool | ${SITE.name}`,
    description: clampDescription(tool.description || tool.tagline),
    path: toolPath(tool.id),
    jsonLd: [softwareJsonLd(tool), breadcrumbJsonLd(tool)],
  };
}

export function notFoundSeo() {
  return {
    title: `Page not found | ${SITE.name}`,
    description: 'That page does not exist. Every tool is listed on the dashboard.',
    path: '/404',
    noindex: true,
    jsonLd: [],
  };
}

/* ------------------------------------------------------------ structured data ---- */

function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.fullName,
    url: absoluteUrl('/'),
    inLanguage: SITE.language,
    description: SITE.description,
    // The dashboard genuinely reads ?q=, so this action is real rather than
    // decorative — a searchbox that does nothing is worse than none at all.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl('/')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

function collectionJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${SITE.name} tools`,
    url: absoluteUrl('/'),
    inLanguage: SITE.language,
  };
}

function softwareJsonLd(tool) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    url: absoluteUrl(toolPath(tool.id)),
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (web browser)',
    description: clampDescription(tool.description || tool.tagline),
    inLanguage: SITE.language,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@type': 'Organization', name: SITE.name, url: absoluteUrl('/') },
  };
}

function breadcrumbJsonLd(tool) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'All tools', item: absoluteUrl('/') },
      {
        '@type': 'ListItem',
        position: 2,
        name: tool.name,
        item: absoluteUrl(toolPath(tool.id)),
      },
    ],
  };
}
