// src/tools/SeoStudio.jsx
// The flagship tool: transcript text, an uploaded transcript or a YouTube link
// in — titles, meta description, long description, hashtags, keyword tiers,
// platform tags and timestamped chapters out.

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlignLeft, Clock, Download, FileText, Hash, KeyRound, Sparkles, Tags, SquarePlay,
} from 'lucide-react';
import { postForm } from '../lib/api';
import { copyText, downloadText, formatDuration } from '../lib/utils';
import {
  Button, ErrorNote, Field, Input, Panel, Segmented, TextArea, ToolGrid,
} from '../components/ui/Primitives';
import {
  CheckList, Chips, CopyRow, Dropzone, EmptyState, ScoreRing, Stat, StatRow,
} from '../components/ui/Display';
import SeoPolish from '../components/ai/SeoPolish';

const MODES = [
  { value: 'text', label: 'Paste text', icon: <AlignLeft size={14} /> },
  { value: 'file', label: 'Upload transcript', icon: <FileText size={14} /> },
  { value: 'youtube', label: 'YouTube link', icon: <SquarePlay size={14} /> },
];

const SAMPLE = `In this video I walk through the exact editing workflow I use for every upload. \
We start by organising the project folder, then build a rough cut from the best takes, \
then tighten the pacing with J-cuts before colour and sound.`;

export default function SeoStudio() {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [knownTitle, setKnownTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const ready = mode === 'text' ? text.trim().length > 40 : mode === 'file' ? !!file : !!url.trim();

  const generate = async () => {
    setError('');
    setLoading(true);

    try {
      let result;

      if (mode === 'text') {
        result = await postForm('/api/seo/from-text', { text, known_title: knownTitle });
      } else if (mode === 'file') {
        result = await postForm('/api/seo/from-file', { file, known_title: knownTitle });
      } else {
        result = await postForm('/api/seo/from-youtube', { url, language });
      }

      setData(result);
      toast.success(`SEO package ready · score ${result.seo.score}/100`);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const chapterBlock = useMemo(
    () => (data?.chapters || []).map((c) => `${c.time} ${c.title}`).join('\n'),
    [data],
  );

  return (
    <ToolGrid>
      <div className="stack">
        <Panel
          title="Source"
          hint="Everything runs on your own transcript — no API keys, no sign-up."
        >
          <Segmented value={mode} onChange={setMode} options={MODES} label="Input source" />

          {mode === 'text' && (
            <Field label="Transcript or script" hint="40+ characters">
              <TextArea
                value={text}
                onChange={setText}
                rows={12}
                maxLength={200000}
                placeholder="Paste your video script, transcript, article or blog draft…"
              />
            </Field>
          )}

          {mode === 'file' && (
            <Dropzone
              file={file}
              onFile={setFile}
              accept=".txt,.md,.srt,.vtt"
              hint="TXT, MD, SRT or VTT — SRT/VTT keep their real timestamps for chapters"
            />
          )}

          {mode === 'youtube' && (
            <>
              <Field label="Video URL">
                <Input
                  value={url}
                  onChange={setUrl}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
              </Field>
              <Field label="Caption language" hint="falls back to any available track">
                <Input value={language} onChange={setLanguage} placeholder="en" />
              </Field>
            </>
          )}

          {mode !== 'youtube' && (
            <Field label="Working title" hint="optional — helps pin the topic">
              <Input
                value={knownTitle}
                onChange={setKnownTitle}
                placeholder="e.g. My video editing workflow"
              />
            </Field>
          )}

          <div className="btn-row">
            <Button icon={<Sparkles size={16} />} loading={loading} disabled={!ready} onClick={generate}>
              {loading ? 'Analysing…' : 'Generate SEO package'}
            </Button>
            {mode === 'text' && !text && (
              <Button variant="ghost" onClick={() => setText(SAMPLE)}>
                Use sample
              </Button>
            )}
          </div>

          <ErrorNote>{error}</ErrorNote>
        </Panel>

        {data?.video?.available && (
          <Panel title="Video" hint={data.video.author}>
            <div className="media-preview">
              <img src={data.video.thumbnails?.hq || data.video.thumbnail} alt="" />
            </div>
            <CopyRow label="Original title" value={data.video.title} />
            <StatRow>
              <Stat label="Duration" value={formatDuration(data.video.duration)} />
              <Stat label="Captions" value={(data.video.caption_language || '—').toUpperCase()} />
              <Stat label="Words" value={data.stats.words.toLocaleString()} />
            </StatRow>
          </Panel>
        )}

        {data && (
          <Panel title="Readiness" hint={`${data.seo.score}/100 · 8 publish checks`}>
            <div className="score-block">
              <ScoreRing score={data.seo.score} />
              <CheckList checks={data.seo.checks} />
            </div>
          </Panel>
        )}
      </div>

      <div className="stack">
        {!data && (
          <Panel>
            <EmptyState icon={<Sparkles size={26} />} title="Your SEO package will appear here">
              Titles, meta description, a full YouTube description, hashtags, three tiers of
              keywords, a paste-ready tag block and timestamped chapters — all generated from
              your own words.
            </EmptyState>
          </Panel>
        )}

        {data && (
          <>
            <Panel
              title="Titles"
              hint={`Topic: ${data.topic} · ranked best-first`}
              actions={
                <Button
                  variant="ghost"
                  onClick={() => copyText(data.titles[0]?.title, 'Best title copied')}
                >
                  Copy best
                </Button>
              }
            >
              {data.titles.slice(0, 6).map((item) => (
                <CopyRow
                  key={item.title}
                  value={item.title}
                  meta={`${item.length} chars · score ${item.score}${item.truncates ? ' · may truncate in search' : ''}`}
                  tone={item.truncates ? 'warn' : item.score >= 80 ? 'good' : undefined}
                />
              ))}
              {data.topic_alternatives?.length > 1 && (
                <Field label="Other topics detected">
                  <Chips items={data.topic_alternatives} tone="muted" />
                </Field>
              )}
            </Panel>

            <Panel title="Descriptions" hint="Meta snippet for search, long form for YouTube">
              <CopyRow
                label="Meta description"
                value={data.meta_description}
                meta={`${data.meta_description.length} / 158 chars`}
                multiline
                tone={
                  data.meta_description.length >= 120 && data.meta_description.length <= 158
                    ? 'good'
                    : 'warn'
                }
              />
              <CopyRow label="Full description" value={data.description} multiline />
              <div className="btn-row end">
                <Button
                  variant="soft"
                  icon={<Download size={15} />}
                  onClick={() => downloadText(`${data.slug}-description.txt`, data.description)}
                >
                  Download .txt
                </Button>
              </div>
            </Panel>

            {/* Renders nothing unless the server has a model connected, so the
                deterministic output above is the whole tool by default. */}
            <SeoPolish
              transcript={data.transcript || (mode === 'text' ? text : '')}
              topic={data.topic}
              titles={data.titles}
              description={data.description}
            />

            <Panel
              title="Hashtags"
              hint={`${data.hashtags.length} tags · click any to copy`}
              actions={
                <Button variant="ghost" icon={<Hash size={15} />} onClick={() => copyText(data.hashtags.join(' '), 'Hashtags copied')}>
                  Copy all
                </Button>
              }
            >
              <Chips items={data.hashtags} />
            </Panel>

            <Panel title="Keywords" hint="Primary head terms, phrases and long-tail queries">
              <Field label="Primary">
                <Chips items={data.keywords.primary} />
              </Field>
              <Field label="Secondary phrases">
                <Chips items={data.keywords.secondary} />
              </Field>
              <Field label="Long-tail">
                <Chips items={data.keywords.long_tail} empty="Not enough text for long-tail phrases." />
              </Field>
              <div className="divider" />
              <Field label="Density" hint="share of total words">
                <div className="kv-list">
                  {data.keywords.density.slice(0, 8).map((item) => (
                    <div className="kv-row" key={item.keyword}>
                      <span>{item.keyword}</span>
                      <span>
                        {item.count}× · {item.density}%
                      </span>
                    </div>
                  ))}
                </div>
              </Field>
            </Panel>

            <Panel
              title="Platform tags"
              hint={`${data.platform_tags.characters} / 500 characters — fits the YouTube tag field`}
              actions={
                <Button variant="ghost" icon={<Tags size={15} />} onClick={() => copyText(data.platform_tags.joined, 'Tag block copied')}>
                  Copy block
                </Button>
              }
            >
              <pre className="code-block">{data.platform_tags.joined}</pre>
            </Panel>

            <Panel
              title="Chapters"
              hint={
                data.video || data.source_file
                  ? 'Timestamps from the real caption timings'
                  : 'Estimated from speaking rate'
              }
              actions={
                <Button variant="ghost" icon={<Clock size={15} />} onClick={() => copyText(chapterBlock, 'Chapters copied')}>
                  Copy
                </Button>
              }
            >
              <div className="result-list">
                {data.chapters.map((chapter, index) => (
                  <div className="list-row" key={`${chapter.time}-${index}`}>
                    <span className="list-row-index">{chapter.time}</span>
                    <span className="list-row-body">{chapter.title}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Extras">
              <CopyRow label="URL slug" value={data.slug} />
              <StatRow>
                <Stat label="Words" value={data.stats.words.toLocaleString()} />
                <Stat label="Sentences" value={data.stats.sentences} />
                <Stat label="Read time" value={formatDuration(data.stats.reading_seconds)} />
                <Stat
                  label="Readability"
                  value={data.readability.score}
                  hint={data.readability.label}
                />
              </StatRow>
              <Field label="Summary used for the description">
                <div className="result-list">
                  {data.summary.map((line, index) => (
                    <div className="list-row" key={index}>
                      <span className="list-row-index">{index + 1}</span>
                      <span className="list-row-body">{line}</span>
                    </div>
                  ))}
                </div>
              </Field>
              <div className="btn-row end">
                <Button
                  variant="soft"
                  icon={<KeyRound size={15} />}
                  onClick={() =>
                    downloadText(`${data.slug}-seo.json`, JSON.stringify(data, null, 2), 'application/json')
                  }
                >
                  Export JSON
                </Button>
              </div>
            </Panel>
          </>
        )}
      </div>
    </ToolGrid>
  );
}
