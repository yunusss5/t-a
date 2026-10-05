// src/tools/audiofy/AudiofySuite.jsx
// The Audiofy suite: browser-only audio tools inside one tool page.
//
// Navigation is state + location.hash rather than new routes: the suite is a
// single catalogue entry, so deep links read /tools/audiofy-suite#trimmer and
// the router stays untouched. The hash sync is what keeps browser back/forward
// working while a visitor moves between sub-tools.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Field, Input, Panel } from '../../components/ui/Primitives';
import FaqSection from '../../components/ui/FaqSection';
import { cx } from '../../lib/utils';
import { ToolFrame } from './toolkit';
import { AUDIOFY_CATEGORIES, AUDIOFY_TOOLS, findAudiofyTool } from './registry';

export default function AudiofySuite({ tool }) {
  const [activeId, setActiveId] = useState(() => window.location.hash.slice(1));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  // External navigation (back/forward, a hash edited by hand) drives the view.
  useEffect(() => {
    const onHashChange = () => setActiveId(window.location.hash.slice(1));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const open = useCallback((id) => {
    window.location.hash = id;
    setActiveId(id);
    window.scrollTo({ top: 0 });
  }, []);

  const close = useCallback(() => {
    window.location.hash = '';
    setActiveId('');
    window.scrollTo({ top: 0 });
  }, []);

  const active = activeId ? findAudiofyTool(activeId) : null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return AUDIOFY_TOOLS.filter((tool) => {
      if (category !== 'all' && tool.category !== category) return false;
      if (!needle) return true;
      return [tool.name, tool.description, tool.category].join(' ').toLowerCase().includes(needle);
    });
  }, [query, category]);

  // An open sub-tool renders alone; the hub grid is the "all tools" view.
  if (active) {
    const Tool = active.component;
    const accent = AUDIOFY_CATEGORIES.find((item) => item.id === active.category)?.accent;

    return (
      <div className="audiofy-suite">
        <ToolFrame tool={active} accent={accent} onBack={close} />
        {/* Parametric tools read their schema from `definition`; bespoke
            components ignore the prop. key forces a fresh instance per
            sub-tool — two parametric tools would otherwise share BufferTool
            state (including a loaded file) across switches. */}
        <Tool key={active.id} definition={active.definition} />
      </div>
    );
  }

  return (
    <div className="audiofy-suite">
      <Panel
        title="About this suite"
        hint={`${AUDIOFY_TOOLS.length} studio tools for trimming, converting, effects and analysis — decoded, processed and exported entirely in this tab.`}
      >
        <div className="between-row">
          <p className="muted-line">
            Files never leave your browser, so nothing here has a size limit beyond your device's
            memory. Exports are 16-bit WAV unless a tool says otherwise.
          </p>
        </div>
      </Panel>

      <Panel title={`Choose a tool (${visible.length})`}>
        <Field label="Search the suite" htmlFor="audiofy-search">
          <Input
            id="audiofy-search"
            type="search"
            value={query}
            onChange={setQuery}
            placeholder="Trim, reverb, BPM, ringtone…"
          />
        </Field>

        <div className="audiofy-cats" role="group" aria-label="Tool categories">
          {/* 'all' is a filter state, not a category — it has no accent of its own. */}
          <button
            type="button"
            className={cx('audiofy-cat', category === 'all' && 'active')}
            onClick={() => setCategory('all')}
            aria-pressed={category === 'all'}
          >
            All
          </button>
          {AUDIOFY_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx('audiofy-cat', item.accent, category === item.id && 'active')}
              onClick={() => setCategory(item.id)}
              aria-pressed={category === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Panel>

      {visible.length > 0 ? (
        <div className="audiofy-grid">
          {visible.map((tool) => {
            const Icon = tool.icon;

            return (
              <button
                key={tool.id}
                type="button"
                className="audiofy-card"
                onClick={() => open(tool.id)}
                data-accent={AUDIOFY_CATEGORIES.find((item) => item.id === tool.category)?.accent}
              >
                <span className="audiofy-card-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="audiofy-card-body">
                  <strong>{tool.name}</strong>
                  <small>{tool.description}</small>
                </span>
                <span className="audiofy-card-cat">{tool.categoryLabel}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <Alert tone="info" title={`No tools match “${query}”`}>
          Try a shorter search, or clear the category filter.
        </Alert>
      )}

      <FaqSection faqs={tool?.faqs} />
    </div>
  );
}
