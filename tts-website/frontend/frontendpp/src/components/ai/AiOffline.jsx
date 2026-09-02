// src/components/ai/AiOffline.jsx
// The panel every AI surface falls back to when no model is connected.
//
// It exists because "off" is the default state of this feature: the site works
// without a model, and the deployed backend may not have one. A greyed-out
// button with no explanation reads as broken, so this says what is missing, what
// it would add, and how to switch it on — which is a two-line change on the
// server and costs nothing to run locally.

import { ChevronDown, Cpu, RefreshCw } from 'lucide-react';
import { Alert, Button } from '../ui/Primitives';

export function AiOffline({ detail, onRetry, checking, children }) {
  return (
    <div className="ai-offline">
      <div className="ai-offline-icon" aria-hidden="true">
        <Cpu size={22} />
      </div>

      <div className="stack-sm">
        <h3 className="ai-offline-title">No model is connected</h3>
        <p className="ai-offline-body">
          {children ||
            'These panels are optional — every other tool on the site is deterministic and needs no model at all.'}
        </p>

        {detail && (
          <Alert tone="info" title="Server reports">
            {detail}
          </Alert>
        )}

        <details className="ai-offline-how">
          {/* The chevron replaces the OS disclosure triangle, which is the one
              piece of native widget styling left in the UI and looks like it
              belongs to a different product. */}
          <summary>
            <span>Run one yourself (free, on your own machine)</span>
            <ChevronDown className="ai-offline-caret" size={15} aria-hidden="true" />
          </summary>
          <div className="ai-offline-how-body">
            <ol>
              <li>
                Install{' '}
                <a href="https://ollama.com" target="_blank" rel="noreferrer noopener">
                  Ollama
                </a>{' '}
                and pull an open model: <code>ollama pull qwen2.5:7b</code>
              </li>
              <li>
                Point the backend at it: <code>AI_PROVIDER=ollama</code>,{' '}
                <code>AI_BASE_URL=http://127.0.0.1:11434</code>, <code>AI_MODEL=qwen2.5:7b</code>
              </li>
              <li>Restart the API and reload this page.</li>
            </ol>
            <p className="muted-line">
              Any OpenAI-compatible endpoint works the same way with{' '}
              <code>AI_PROVIDER=openai-compatible</code>. Keys stay in the server&apos;s environment —
              nothing is ever sent to the browser.
            </p>
          </div>
        </details>

        {onRetry && (
          <div className="btn-row">
            <Button
              variant="soft"
              icon={<RefreshCw size={15} />}
              loading={checking}
              onClick={onRetry}
            >
              Check again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AiOffline;
