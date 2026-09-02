// src/tools/AiStudio.jsx
// ---------------------------------------------------------------------------
// The one place a language model is the tool rather than a helper.
//
// The server owns the tasks: the list in the dropdown comes from
// /api/ai/status, and the request carries a task *id*, never an instruction. So
// the worst a visitor can send is a different id from the same list, and their
// own text only ever arrives inside the server's fence.
//
// Answers stream, because a 7B model on a laptop takes ten seconds to finish a
// paragraph and watching it arrive is the difference between "working" and
// "hung". The abort control is part of that: a stream you cannot stop is worse
// than no stream.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Download, Sparkles, Square, Wand2 } from 'lucide-react';
import { streamAssist } from '../lib/ai';
import { useAiStatus } from '../hooks/useAiStatus';
import { copyText, downloadText } from '../lib/utils';
import {
  Alert, Button, Field, Panel, Select, Skeleton, SkeletonText, Switch, TextArea, ToolGrid,
} from '../components/ui/Primitives';
import { EmptyState } from '../components/ui/Display';
import AiOffline from '../components/ai/AiOffline';

const MIN_CHARS = 12;

const SAMPLE = `Today I'm rebuilding my desk setup from scratch on a budget of three hundred \
pounds. The monitor arm was the single best purchase — it freed up the whole back half of the \
desk. The keyboard tray was the worst: it rattles, and I took it off after two days.`;

export default function AiStudio() {
  const { status, checking, refresh, enabled, tasks, tones, maxChars } = useAiStatus();

  const [taskChoice, setTaskChoice] = useState('');
  const [toneChoice, setToneChoice] = useState('');
  const [content, setContent] = useState('');
  const [stream, setStream] = useState(true);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  // The task and tone lists are the server's, so a choice is only honoured while
  // it is still on offer and otherwise falls back to the first entry. Derived
  // rather than seeded into state by an effect: the lists arrive after the first
  // render, and a copy of them here is a copy that can go stale.
  const task = tasks.some((item) => item.id === taskChoice) ? taskChoice : tasks[0]?.id || '';
  const tone = tones.includes(toneChoice) ? toneChoice : tones[0] || '';

  // A stream that outlives its page keeps a model busy for nothing.
  useEffect(() => () => abortRef.current?.abort(), []);

  const active = useMemo(() => tasks.find((item) => item.id === task), [tasks, task]);
  const limit = maxChars || 12000;
  const tooShort = content.trim().length < MIN_CHARS;

  const run = async () => {
    setError('');
    setOutput('');
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const text = await streamAssist({
        task,
        content,
        tone,
        signal: controller.signal,
        onDelta: stream ? (piece) => setOutput((current) => current + piece) : undefined,
      });

      // With streaming off the deltas were ignored, so the whole answer lands
      // at once — same request, one repaint.
      setOutput(text.trim());
      if (text.trim()) toast.success(`${active?.label || 'Answer'} ready`);
    } catch (err) {
      if (err?.name === 'AbortError') {
        toast('Stopped');
      } else {
        setError(err.message);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  if (checking && !status) {
    return (
      <ToolGrid>
        <Panel title="Assistant">
          <Skeleton height={44} radius={12} />
          <SkeletonText lines={4} label="Checking for a connected model" />
        </Panel>
        <Panel>
          <SkeletonText lines={6} label="Loading" />
        </Panel>
      </ToolGrid>
    );
  }

  if (!enabled) {
    return (
      <ToolGrid>
        <Panel title="Assistant" hint="Optional — the rest of the toolkit needs no model">
          <AiOffline detail={status?.detail} onRetry={refresh} checking={checking}>
            An assistant here would rewrite hooks, titles, descriptions and outlines from your own
            script. Every other tool on this site is deterministic and works without one.
          </AiOffline>
        </Panel>
        <Panel>
          <EmptyState icon={<Sparkles size={26} />} title="What this would do">
            Eight writing tasks — opening hooks, title options, a description, a shooting outline,
            shorts to cut, a tightened script, chapter titles and thumbnail text — each grounded in
            the material you paste rather than invented.
          </EmptyState>
        </Panel>
      </ToolGrid>
    );
  }

  return (
    <ToolGrid>
      <div className="stack">
        <Panel
          title="Assistant"
          hint={`${status.model} · ${status.provider}`}
          actions={
            <span className="ai-dot" title="Model connected">
              <span className="ai-dot-pulse" aria-hidden="true" />
              <span className="sr-only">Model connected: </span>
              live
            </span>
          }
        >
          <Field label="Task" hint={active?.hint} htmlFor="ai-task">
            <Select
              id="ai-task"
              value={task}
              onChange={setTaskChoice}
              options={tasks.map((item) => ({ value: item.id, label: item.label }))}
            />
          </Field>

          <Field label="Tone" htmlFor="ai-tone">
            <Select id="ai-tone" value={tone} onChange={setToneChoice} options={tones} />
          </Field>

          <Field
            label="Your material"
            hint={`script, notes or a topic · ${MIN_CHARS}+ characters`}
          >
            <TextArea
              value={content}
              onChange={setContent}
              rows={12}
              maxLength={limit}
              placeholder="Paste your script, transcript or a one-line topic…"
            />
          </Field>

          <Switch
            checked={stream}
            onChange={setStream}
            label="Stream the answer"
            hint="Show words as the model produces them"
          />

          <div className="btn-row">
            <Button icon={<Wand2 size={16} />} loading={running} disabled={tooShort} onClick={run}>
              {running ? 'Writing…' : 'Generate'}
            </Button>
            {running && (
              <Button variant="soft" icon={<Square size={14} />} onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            )}
            {!running && !content && (
              <Button variant="ghost" onClick={() => setContent(SAMPLE)}>
                Use sample
              </Button>
            )}
          </div>

          {error && (
            <Alert tone="danger" title="That did not work">
              {error}
            </Alert>
          )}
        </Panel>

        <Panel title="How this stays safe" headingLevel={2}>
          <ul className="note-list">
            <li>The instruction is server-side. You choose a task, never a prompt.</li>
            <li>Your text is fenced and stripped of invisible characters before it is sent on.</li>
            <li>No key reaches this page: the model is configured in the server environment.</li>
            <li>Nothing is stored. The answer exists in this tab until you leave it.</li>
          </ul>
        </Panel>
      </div>

      <Panel
        title={active?.label || 'Answer'}
        hint={output ? `${output.length.toLocaleString()} characters` : undefined}
        actions={
          output && (
            <div className="panel-actions">
              <Button variant="ghost" icon={<Copy size={15} />} onClick={() => copyText(output, 'Answer copied')}>
                Copy
              </Button>
              <Button
                variant="ghost"
                icon={<Download size={15} />}
                onClick={() => downloadText(`${task || 'answer'}.txt`, output)}
              >
                .txt
              </Button>
            </div>
          )
        }
      >
        {/* aria-live so the answer is announced as it fills in, politely: an
            assertive region would interrupt on every token. */}
        <div className="ai-output" aria-live="polite" aria-busy={running || undefined}>
          {output ? (
            <p className="ai-output-text">{output}</p>
          ) : running ? (
            <SkeletonText lines={5} label="Waiting for the model" />
          ) : (
            <EmptyState icon={<Sparkles size={26} />} title="The answer appears here">
              Pick a task, paste your material and generate. Answers come from your own words — the
              model is told not to invent facts the material does not support.
            </EmptyState>
          )}
        </div>
      </Panel>
    </ToolGrid>
  );
}
