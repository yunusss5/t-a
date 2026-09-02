// src/pages/ToolPage.jsx
import { Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, Star } from 'lucide-react';
import { getTool, relatedTools } from '../tools/registry';
import { toolSeo } from '../lib/seo';
import useSeo from '../hooks/useSeo';
import { cx } from '../lib/utils';
import NotFoundPage from './NotFoundPage';

/** Resolves :toolId from the route, renders the lazy tool inside a shared header. */
export default function ToolPage({ favourites, onToggleFavourite }) {
  const { toolId } = useParams();
  const tool = getTool(toolId);

  // An unknown :toolId is a 404, not a variant of the tool page: same copy and
  // the same `noindex` as any other bad URL.
  if (!tool) return <NotFoundPage />;

  return (
    <ToolView
      key={tool.id}
      tool={tool}
      favourite={favourites.includes(tool.id)}
      onToggleFavourite={onToggleFavourite}
    />
  );
}

function ToolView({ tool, favourite, onToggleFavourite }) {
  const Icon = tool.icon;
  const Component = tool.component;
  const related = relatedTools(tool);
  const reduceMotion = useReducedMotion();

  useSeo(toolSeo(tool));

  return (
    <motion.div
      className="tool-page"
      data-accent={tool.accent}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="tool-head">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} aria-hidden="true" /> All tools
        </Link>

        <div className="tool-head-main">
          <span className="tool-head-icon" aria-hidden="true">
            <Icon size={24} />
          </span>

          <div className="tool-head-text">
            <h1>{tool.name}</h1>
            <p>{tool.tagline}</p>
          </div>

          <button
            type="button"
            className={cx('fav-btn static', favourite && 'active')}
            onClick={() => onToggleFavourite(tool.id)}
            aria-pressed={favourite}
            aria-label={
              favourite ? `Remove ${tool.name} from favourites` : `Add ${tool.name} to favourites`
            }
          >
            <Star size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="tool-loading" role="status">
            <Loader2 className="spin" size={22} aria-hidden="true" />
            <p>Loading {tool.name}…</p>
          </div>
        }
      >
        <Component />
      </Suspense>

      {related.length > 0 && (
        <section className="related" aria-labelledby="related-title">
          <h2 id="related-title">Related tools</h2>
          <ul className="related-grid">
            {related.map((item) => {
              const RelatedIcon = item.icon;

              return (
                <li key={item.id}>
                  <Link
                    to={`/tools/${item.id}`}
                    className="related-card"
                    data-accent={item.accent}
                  >
                    <span className="related-icon" aria-hidden="true">
                      <RelatedIcon size={16} />
                    </span>
                    <span className="related-text">
                      <strong>{item.name}</strong>
                      <small>{item.tagline}</small>
                    </span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </motion.div>
  );
}
