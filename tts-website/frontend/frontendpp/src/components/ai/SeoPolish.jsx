// src/components/ai/SeoPolish.jsx
// ---------------------------------------------------------------------------
// The optional model pass over a finished SEO package.
//
// Two rules shape this component:
//
//   1. The deterministic package stays the source of truth. A rewrite is shown
//      *beside* it, never merged into it, so "revert" is just discarding this
//      panel's own state — there is nothing to restore.
//   2. It only appears when a model is actually connected. With no model the
//      flagship tool is exactly what it was before, and nothing here hints at a
//      feature the deployment cannot provide.
//
// The transcript is sent again rather than trusted from the package, because the
// polish task's whole job is staying inside what the source material supports.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import toast from 'react-hot-toast';
import { RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { polishSeo } from '../../lib/ai';
import { useAiStatus } from '../../hooks/useAiStatus';
import { Alert, Button, Field, Panel, SkeletonText } from '../ui/Primitives';
import { CopyRow } from '../ui/Display';

/** The server needs this much material to ground a rewrite (ai/service.py). */
const MIN_TRANSCRIPT_CHARS = 200;

export default function SeoPolish({ transcript, topic, titles, description }) {
  const { status, enabled } = useAiStatus();
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  // No model, no panel. Every other panel in this tool is deterministic.
  if (!enabled) return null;

  const source = String(transcript || '');
  const tooShort = source.trim().length < MIN_TRANSCRIPT_CHARS;

  const run = async () => {
    setError('');
    setRunning(true);

    try {
      const reply = await polishSeo({
        transcript: source,
        // Only the three fields the prompt uses, and titles as plain strings:
        // the generator's title objects would reach the model as "[object]".
        seoPackage: {
          topic,
          titles: (titles || []).slice(0, 6).map((item) => item.title || item),
          description,
        },
      });

      setResult(reply);
      toast.success('Rewrite ready');
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel
      title="Polish with the model"
      hint={`Optional · ${status.model}`}
      actions={
        result && (
          <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={() => setResult(null)}>
            Discard
          </Button>
        )
      }
    >
      <p className="muted-line">
        The package above is generated from your transcript by fixed rules and does not change.
        This rewrites the same material into warmer wording — keep whichever reads better.
      </p>

      {tooShort ? (
        <Alert tone="info" title="Not enough material">
          A rewrite needs at least {MIN_TRANSCRIPT_CHARS} characters of transcript to stay grounded
          in what you actually said.
        </Alert>
      ) : (
        <div className="btn-row">
          <Button icon={<Wand2 size={16} />} loading={running} onClick={run}>
            {running ? 'Rewriting…' : result ? 'Rewrite again' : 'Rewrite'}
          </Button>
        </div>
      )}

      {error && (
        <Alert tone="danger" title="The model could not finish">
          {error}
        </Alert>
      )}

      <div aria-live="polite" aria-busy={running || undefined}>
        {running && !result && <SkeletonText lines={4} label="Waiting for the rewrite" />}

        {result && (
          <div className="stack-sm">
            {result.hook && <CopyRow label="Opening hook" value={result.hook} multiline />}

            {/* The endpoint guarantees a non-empty list, but a render is the
                wrong place to trust that: a missing key here would take the
                whole tool page down with it. */}
            {(result.titles || []).length > 0 && (
              <Field label="Rewritten titles" hint={`${result.titles.length} options`}>
                {result.titles.map((title) => (
                  <CopyRow key={title} value={title} meta={`${title.length} chars`} />
                ))}
              </Field>
            )}

            {result.description && (
              <CopyRow label="Rewritten description" value={result.description} multiline />
            )}

            {result.notes && (
              <Alert tone="info" icon={<Sparkles size={15} />} title="Model note">
                {result.notes}
              </Alert>
            )}

            <p className="muted-line">
              Written by {result.model}. Check any claim against your own material before
              publishing — a model will happily sound confident about something you never said.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
