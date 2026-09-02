// vite/plugins/seo-prerender.js
// ---------------------------------------------------------------------------
// SSG-lite. The app is a client-rendered SPA, which means a crawler that does
// not execute JavaScript sees one identical <head> for all 23 URLs. This step
// runs after the bundle is written and stamps out a real HTML file per route —
// same script tags, but with that route's title, description, canonical, Open
// Graph and JSON-LD already in the markup, plus a <noscript> summary.
//
// It also emits sitemap.xml and robots.txt. Those are generated rather than
// checked into public/ so the origin in them can only ever be SITE.url — a
// hand-written sitemap goes stale the moment the domain changes.
//
// Vercel resolves the filesystem before applying rewrites, so dist/tools/<id>/
// index.html is served for /tools/<id> and the SPA rewrite still catches
// everything else.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CATALOGUE } from '../../src/tools/catalogue.js';
import { SITE, absoluteUrl, homeSeo, notFoundSeo, toolSeo } from '../../src/lib/seo.js';

const SEO_REGION = /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/;
const NOSCRIPT_REGION = /<!-- noscript:start -->[\s\S]*?<!-- noscript:end -->/;
const CSP_REGION = /<!-- csp:start -->[\s\S]*?<!-- csp:end -->/;

/** Inline <script> bodies, i.e. those with no src attribute. */
const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;

const NOSCRIPT_STYLE =
  'max-width: 40rem; margin: 4rem auto; padding: 0 1.25rem; ' +
  'font-family: system-ui, sans-serif; line-height: 1.6';

/** Escape for a double-quoted attribute or text node. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `</script>` inside a JSON-LD payload would close the block early. */
function escJson(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function headTags(seo) {
  const url = absoluteUrl(seo.path);
  const image = absoluteUrl(SITE.ogImage);
  const robots = seo.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large';

  const tags = [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${esc(seo.type || 'website')}" />`,
    `<meta property="og:site_name" content="${esc(SITE.fullName)}" />`,
    `<meta property="og:title" content="${esc(seo.title)}" />`,
    `<meta property="og:description" content="${esc(seo.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(SITE.fullName)}" />`,
    '<meta property="og:locale" content="en_US" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(seo.title)}" />`,
    `<meta name="twitter:description" content="${esc(seo.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];

  for (const block of seo.jsonLd || []) {
    tags.push(`<script type="application/ld+json" data-seo-jsonld>${escJson(block)}</script>`);
  }

  return tags.join('\n    ');
}

/**
 * A crawler that ignores JS still gets the heading, the prose and a route back
 * into the site — the internal links matter as much as the copy.
 */
function noscriptBlock({ heading, body, links }) {
  const list = links
    .map((item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`)
    .join('\n          ');

  return [
    '<noscript>',
    `      <div style="${NOSCRIPT_STYLE}">`,
    `        <h1>${esc(heading)}</h1>`,
    `        <p>${esc(body)}</p>`,
    '        <p>The tools run in JavaScript, so please enable it to use them.</p>',
    '        <ul>',
    `          ${list}`,
    '        </ul>',
    '      </div>',
    '    </noscript>',
  ].join('\n');
}

function renderRoute(template, seo, noscript, origins) {
  const html = template
    .replace(SEO_REGION, headTags(seo))
    .replace(NOSCRIPT_REGION, noscriptBlock(noscript));

  // Last, and per route: the policy hashes every inline script in the finished
  // document, and the JSON-LD blocks the step above just wrote are inline
  // scripts too — script-src is enforced on them even though they never
  // execute, so an unhashed block is a dropped rich result.
  return html.replace(CSP_REGION, cspMeta(html, origins));
}

/* ------------------------------------------------------------------- csp ---- */

/** Fallback origin. Must stay in step with the default in src/lib/api.js. */
const DEFAULT_VITE_API_BASE = 'https://tts-backend-33xv.onrender.com';

/**
 * Origin the app fetches from, so connect-src can name it instead of falling
 * back to a wildcard.
 *
 * `configured` has to be the value Vite resolved for the *client* — read from
 * `config.env`, not `process.env`. Vite loads .env files into `config.env`
 * only; `process.env.VITE_API_BASE` is undefined unless someone exported it in
 * the shell, so this used to name the hard-coded default while the bundle had
 * fetched a different origin from .env.local, and the shipped policy blocked
 * the app's own backend. One source, one origin.
 *
 * An empty VITE_API_BASE means same-origin, which 'self' already covers.
 */
function apiOrigins(configured) {
  if (!configured) return [];
  try {
    return [new URL(configured).origin];
  } catch {
    return [];
  }
}

/**
 * A hash-based policy, built from the inline scripts actually present in the
 * built HTML — the pre-paint theme bootstrap has to be inline to work, and
 * hashing it is what lets script-src stay free of 'unsafe-inline'.
 *
 * style-src does keep 'unsafe-inline': React and framer-motion set element
 * style attributes on essentially every animated node, and no hash or nonce
 * scheme covers those.
 */
function cspMeta(template, origins) {
  const hashes = [];
  for (const [, body] of template.matchAll(INLINE_SCRIPT)) {
    if (!body.trim()) continue;
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }

  const policy = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ["connect-src 'self'", ...origins].join(' '),
    'upgrade-insecure-requests',
  ].join('; ');

  return `<meta http-equiv="Content-Security-Policy" content="${esc(policy)}" />`;
}

function sitemap(routes) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = routes
    .map(
      ({ path: route, priority }) =>
        [
          '  <url>',
          `    <loc>${esc(absoluteUrl(route))}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          '    <changefreq>weekly</changefreq>',
          `    <priority>${priority}</priority>`,
          '  </url>',
        ].join('\n'),
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

function robots() {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');
}

export default function seoPrerender() {
  let outDir = 'dist';
  let apiBase = DEFAULT_VITE_API_BASE;
  let origins = [];

  return {
    name: 'voiceforge:seo-prerender',
    apply: 'build',

    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      // config.env is what the client bundle gets for import.meta.env, so the
      // policy and the fetches it governs can no longer disagree.
      apiBase = config.env.VITE_API_BASE ?? DEFAULT_VITE_API_BASE;
      origins = apiOrigins(apiBase);
    },

    // closeBundle, not generateBundle: the template we clone is the *written*
    // index.html, after Vite has injected the hashed script and style tags.
    async closeBundle() {
      const indexPath = path.join(outDir, 'index.html');
      const template = await readFile(indexPath, 'utf8');

      if (!SEO_REGION.test(template) || !NOSCRIPT_REGION.test(template)) {
        this.warn(
          'seo-prerender: marker comments missing from dist/index.html — ' +
            'per-route metadata was not written.',
        );
        return;
      }

      // A bundle that points at localhost works on exactly one machine. It is a
      // real mistake to ship and an easy one to make, because .env.local
      // applies to `build` as well as `dev`.
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(apiBase)) {
        this.warn(
          `seo-prerender: VITE_API_BASE is ${apiBase} — this build can only reach ` +
            'a backend on the same machine. Use .env.development.local for local overrides.',
        );
      }

      const written = [];

      // The dashboard, rewritten in place so / gets the og:image:alt and
      // twitter:* tags the tool pages get.
      await writeFile(
        indexPath,
        renderRoute(
          template,
          homeSeo(CATALOGUE.length),
          {
            heading: SITE.fullName,
            body: SITE.description,
            links: CATALOGUE.map((tool) => ({
              href: `/tools/${tool.id}`,
              label: `${tool.name} — ${tool.tagline}`,
            })),
          },
          origins,
        ),
        'utf8',
      );
      written.push('index.html');

      for (const tool of CATALOGUE) {
        const dir = path.join(outDir, 'tools', tool.id);
        await mkdir(dir, { recursive: true });
        await writeFile(
          path.join(dir, 'index.html'),
          renderRoute(
            template,
            toolSeo(tool),
            {
              heading: `${tool.name} — ${SITE.name}`,
              body: tool.description || tool.tagline,
              links: [
                { href: '/', label: 'All VoiceForge tools' },
                ...CATALOGUE.filter(
                  (item) => item.category === tool.category && item.id !== tool.id,
                )
                  .slice(0, 4)
                  .map((item) => ({ href: `/tools/${item.id}`, label: item.name })),
              ],
            },
            origins,
          ),
          'utf8',
        );
        written.push(`tools/${tool.id}/index.html`);
      }

      // Vercel serves 404.html for unmatched paths only when there is no
      // catch-all rewrite; this is here so any other host (and `vite preview`)
      // has a real, noindexed 404 body to serve.
      await writeFile(
        path.join(outDir, '404.html'),
        renderRoute(
          template,
          notFoundSeo(),
          {
            heading: 'Page not found',
            body: 'That page does not exist. Every tool is listed on the dashboard.',
            links: [{ href: '/', label: 'All VoiceForge tools' }],
          },
          origins,
        ),
        'utf8',
      );
      written.push('404.html');

      await writeFile(
        path.join(outDir, 'sitemap.xml'),
        sitemap([
          { path: '/', priority: '1.0' },
          ...CATALOGUE.map((tool) => ({ path: `/tools/${tool.id}`, priority: '0.8' })),
        ]),
        'utf8',
      );
      await writeFile(path.join(outDir, 'robots.txt'), robots(), 'utf8');

      this.info?.(
        `seo-prerender: ${written.length} HTML routes + sitemap.xml + robots.txt for ${SITE.url}`,
      );
    },
  };
}
