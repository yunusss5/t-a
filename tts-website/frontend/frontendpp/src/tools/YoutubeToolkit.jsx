// src/tools/YoutubeToolkit.jsx
// Public metadata, every thumbnail size and the full transcript for any video.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, ExternalLink, Search, SquarePlay } from 'lucide-react';
import { postForm } from '../lib/api';
import { copyText, downloadText, formatDuration } from '../lib/utils';
import { Button, ErrorNote, Field, Input, Panel, ToolGrid } from '../components/ui/Primitives';
import { CopyRow, EmptyState, Stat, StatRow } from '../components/ui/Display';

const SIZES = [
  ['maxres', '1280×720 (maxres)'],
  ['sd', '640×480 (sd)'],
  ['hq', '480×360 (hq)'],
  ['mq', '320×180 (mq)'],
  ['default', '120×90 (default)'],
];

export default function YoutubeToolkit() {
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const inspect = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await postForm('/api/youtube/inspect', { url, language });
      setData(result);
      toast.success(result.transcript ? 'Video and captions loaded' : 'Video loaded');
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Video" hint="Works with watch, youtu.be, Shorts and live URLs.">
          <Field label="YouTube URL">
            <Input
              value={url}
              onChange={setUrl}
              placeholder="https://youtu.be/…"
              onKeyDown={(event) => event.key === 'Enter' && url.trim() && inspect()}
            />
          </Field>
          <Field label="Caption language">
            <Input value={language} onChange={setLanguage} placeholder="en" />
          </Field>
          <div className="btn-row">
            <Button icon={<Search size={16} />} loading={loading} disabled={!url.trim()} onClick={inspect}>
              Inspect video
            </Button>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </Panel>

        {data && (
          <Panel title="Details">
            {data.available ? (
              <>
                <CopyRow label="Title" value={data.title} multiline />
                <CopyRow label="Channel" value={data.author} />
              </>
            ) : (
              <p className="inline-note">
                Metadata is unavailable (private, age-gated or region-locked), but thumbnails and
                captions may still work.
              </p>
            )}
            <CopyRow label="Video ID" value={data.video_id} />
            <StatRow>
              <Stat label="Duration" value={data.duration ? formatDuration(data.duration) : '—'} />
              <Stat label="Cues" value={data.cues?.length ?? '—'} />
              <Stat
                label="Transcript"
                value={data.transcript ? `${data.transcript.length.toLocaleString()} ch` : '—'}
              />
            </StatRow>
            <div className="btn-row">
              <a className="ui-btn ui-btn-soft" href={data.watch_url} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Open on YouTube
              </a>
            </div>
          </Panel>
        )}
      </div>

      <div className="stack">
        {!data && (
          <Panel>
            <EmptyState icon={<SquarePlay size={26} />} title="Paste a link to begin">
              You get the title, channel, every thumbnail resolution and the complete transcript —
              no API key required.
            </EmptyState>
          </Panel>
        )}

        {data && (
          <>
            <Panel title="Thumbnails" hint="Right-click to save, or use the download button.">
              <div className="thumb-grid">
                {SIZES.map(([key, label]) =>
                  data.thumbnails?.[key] ? (
                    <div className="thumb-card" key={key}>
                      <img src={data.thumbnails[key]} alt={label} loading="lazy" />
                      <small>{label}</small>
                      <a className="ui-btn ui-btn-ghost" href={data.thumbnails[key]} target="_blank" rel="noreferrer">
                        <Download size={14} /> Open
                      </a>
                    </div>
                  ) : null,
                )}
              </div>
            </Panel>

            <Panel
              title="Transcript"
              hint={data.caption_error || `${data.cues?.length || 0} cues`}
              actions={
                data.transcript && (
                  <>
                    <Button variant="ghost" onClick={() => copyText(data.transcript, 'Transcript copied')}>
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<Download size={15} />}
                      onClick={() => downloadText(`${data.video_id}-transcript.txt`, data.transcript)}
                    >
                      .txt
                    </Button>
                  </>
                )
              }
            >
              {data.transcript ? (
                <pre className="code-block">{data.transcript}</pre>
              ) : (
                <p className="inline-note">{data.caption_error || 'This video has no captions.'}</p>
              )}
            </Panel>
          </>
        )}
      </div>
    </ToolGrid>
  );
}
