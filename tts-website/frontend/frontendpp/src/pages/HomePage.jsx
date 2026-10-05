// src/pages/HomePage.jsx
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Search, Sparkles, Star } from 'lucide-react';
import { CATEGORIES, TOOLS, searchTools } from '../tools/registry';
import { homeSeo } from '../lib/seo';
import useSeo from '../hooks/useSeo';
import { cx } from '../lib/utils';
import { useI18n } from '../i18n';

export default function HomePage({ favourites, onToggleFavourite }) {
  const [searchParams] = useSearchParams();
  // Seeded from ?q= so the sitelinks SearchAction advertised in the home page's
  // JSON-LD actually lands on a filtered dashboard. Typing afterwards does not
  // write back to the URL — one history entry per keystroke is unusable.
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [filter, setFilter] = useState('all');
  const { t } = useI18n();
  const filters = [
    { id: 'all', label: t('home.all') },
    ...CATEGORIES.map((category) => ({ ...category, label: t(`category.${category.id}`) })),
  ];

  useSeo(homeSeo(TOOLS.length));

  const visible = useMemo(() => {
    const found = searchTools(query);
    return filter === 'all' ? found : found.filter((tool) => tool.category === filter);
  }, [query, filter]);

  return (
    <div className="home">
      <section className="hero">
        <span className="hero-pill">
          <Sparkles size={13} aria-hidden="true" /> {t('home.heroPill', { count: TOOLS.length })}
        </span>

        <h1>
          {t('home.title.before')}<span className="grad-text">{t('home.title.audio')}</span>
          {t('home.title.after')}
        </h1>

        <p className="hero-sub">
          {t('home.description')}
        </p>

        <div className="hero-actions">
          <Link to="/tools/audiofy-suite" className="ui-btn ui-btn-primary hero-cta">
            <Sparkles size={16} aria-hidden="true" />
            {t('home.openAudioKit')}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/tools/text-to-speech" className="ui-btn ui-btn-ghost">
            {t('home.tryTextToSpeech')}
          </Link>
        </div>
      </section>

      <section className="catalogue" aria-labelledby="catalogue-title">
        {/* The catalogue needs a heading for both the outline and the landmark
            name; the filter bar already communicates it visually. */}
        <h2 className="sr-only" id="catalogue-title">
          All tools
        </h2>

        <div className="catalogue-bar">
          <div className="search-shell">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('home.searchPlaceholder')}
              aria-label={t('app.searchTools')}
              autoComplete="off"
            />
          </div>

          <div className="filter-row" role="group" aria-label={t('home.filterByCategory')}>
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx('filter-chip', filter === item.id && 'active')}
                onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {t('home.toolShown', { count: visible.length })}
        </p>

        {visible.length === 0 ? (
          <p className="muted-line center">
            {t('home.noMatches', { query })}
          </p>
        ) : (
          <ul className="tool-cards">
            {visible.map((tool, index) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                index={index}
                favourite={favourites.includes(tool.id)}
                onToggleFavourite={onToggleFavourite}
                t={t}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ToolCard({ tool, index, favourite, onToggleFavourite, t }) {
  const Icon = tool.icon;
  const reduceMotion = useReducedMotion();

  return (
    <motion.li
      className="tool-card"
      data-accent={tool.accent}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.3),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <span className="tool-card-icon" aria-hidden="true">
        <Icon size={20} />
      </span>

      <div className="tool-card-body">
        <h3>
          {/* Only the title is the anchor — its text is the link text a crawler
              indexes — but its ::after stretches over the whole card, so the
              click target is the card and the star stays a real sibling button
              instead of being nested inside an <a>. */}
          <Link to={tool.href || `/tools/${tool.id}`} className="tool-card-link">
            {tool.name}
          </Link>
          {tool.badge && <span className="tool-badge">{tool.badge}</span>}
        </h3>
        <p>{tool.tagline}</p>
      </div>

      <span className="tool-card-foot">
        <span className="tool-card-tag">{tool.server ? t('home.cloud') : t('home.inBrowser')}</span>
        <ArrowRight size={15} className="tool-card-arrow" aria-hidden="true" />
      </span>

      <button
        type="button"
        className={cx('fav-btn', favourite && 'active')}
        onClick={() => onToggleFavourite(tool.id)}
        aria-pressed={favourite}
        aria-label={favourite ? t('home.removeFavourite', { name: tool.name }) : t('home.addFavourite', { name: tool.name })}
      >
        <Star size={14} aria-hidden="true" />
      </button>
    </motion.li>
  );
}
