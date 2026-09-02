// src/hooks/useSeo.js
import { useEffect } from 'react';
import { SITE, absoluteUrl } from '../lib/seo';

/**
 * Applies one page's SEO record to <head>.
 *
 * Tags are updated in place rather than removed and re-added: swapping nodes on
 * every navigation makes the head flicker between states, and a crawler that
 * snapshots mid-swap can catch a page with no title. Anything this hook owns is
 * marked `data-seo` so the build-time prerender can emit the same set and the
 * client can adopt those nodes instead of duplicating them.
 */
export default function useSeo({
  title,
  description,
  path = '/',
  image = SITE.ogImage,
  type = 'website',
  noindex = false,
  jsonLd = [],
}) {
  // JSON-LD is compared by value: the objects are rebuilt on every render, so a
  // reference check would rewrite the script tag on each keystroke.
  const jsonLdKey = JSON.stringify(jsonLd);

  useEffect(() => {
    const canonical = absoluteUrl(path);
    const ogImage = absoluteUrl(image);

    if (title) document.title = title;

    setMeta('name', 'description', description);
    setMeta(
      'name',
      'robots',
      noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large',
    );
    setLink('canonical', canonical);

    setMeta('property', 'og:type', type);
    setMeta('property', 'og:site_name', SITE.fullName);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonical);
    setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:image:width', '1200');
    setMeta('property', 'og:image:height', '630');
    setMeta('property', 'og:image:alt', `${SITE.name} — ${title || SITE.fullName}`);
    setMeta('property', 'og:locale', 'en_US');

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', ogImage);

    setJsonLd(JSON.parse(jsonLdKey));
  }, [title, description, path, image, type, noindex, jsonLdKey]);
}

function setMeta(attr, key, content) {
  if (!content) return;

  let node = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attr, key);
    node.setAttribute('data-seo', '');
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

function setLink(rel, href) {
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', rel);
    node.setAttribute('data-seo', '');
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
}

function setJsonLd(blocks) {
  const existing = document.head.querySelectorAll('script[data-seo-jsonld]');
  existing.forEach((node) => node.remove());

  blocks.filter(Boolean).forEach((block) => {
    const node = document.createElement('script');
    node.type = 'application/ld+json';
    node.setAttribute('data-seo-jsonld', '');
    node.textContent = JSON.stringify(block);
    document.head.appendChild(node);
  });
}
