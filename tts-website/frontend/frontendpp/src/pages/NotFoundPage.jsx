// src/pages/NotFoundPage.jsx
import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { TOOLS } from '../tools/registry';
import { notFoundSeo } from '../lib/seo';
import useSeo from '../hooks/useSeo';

// A handful of genuinely popular destinations, not the whole catalogue: a 404
// that dumps 23 links is a sitemap, not a recovery.
const SUGGESTED = ['seo-studio', 'text-to-speech', 'subtitle-studio', 'image-studio'];

/**
 * Real 404 page. The previous behaviour — redirecting every unknown URL to `/`
 * — is a soft 404: a crawler is told the wrong page exists and indexes the
 * dashboard under a dozen dead URLs. This renders an honest dead end and marks
 * itself `noindex`.
 */
export default function NotFoundPage() {
  useSeo(notFoundSeo());

  const suggestions = SUGGESTED.map((id) => TOOLS.find((tool) => tool.id === id)).filter(Boolean);

  return (
    <div className="not-found">
      <span className="not-found-mark" aria-hidden="true">
        <Compass size={26} />
      </span>

      <p className="not-found-code">404</p>
      <h1>This page doesn’t exist</h1>
      <p className="not-found-lead">
        The link may be out of date or mistyped. Every tool is listed on the dashboard — or start
        with one of these.
      </p>

      <div className="btn-row">
        <Link to="/" className="ui-btn ui-btn-primary">
          <ArrowLeft size={16} aria-hidden="true" /> Back to all tools
        </Link>
      </div>

      <ul className="not-found-links">
        {suggestions.map((tool) => (
          <li key={tool.id}>
            <Link to={`/tools/${tool.id}`} className="not-found-link" data-accent={tool.accent}>
              {tool.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
