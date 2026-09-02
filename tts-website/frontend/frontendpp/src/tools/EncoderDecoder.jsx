// src/tools/EncoderDecoder.jsx
// Base64, URL, HTML entities, hex and JWT payload inspection.

import { useMemo, useState } from 'react';
import { ArrowDownUp, Binary } from 'lucide-react';
import { copyText } from '../lib/utils';
import {
  Button, ErrorNote, Field, Panel, Segmented, TextArea, ToolGrid,
} from '../components/ui/Primitives';
import { EmptyState } from '../components/ui/Display';

/* Base64 needs a UTF-8 round-trip; btoa alone breaks on non-Latin characters. */
const utf8ToBase64 = (value) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)));

const base64ToUtf8 = (value) =>
  new TextDecoder().decode(Uint8Array.from(atob(value.trim()), (c) => c.charCodeAt(0)));

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (value) => value.replace(/[&<>"']/g, (ch) => ENTITIES[ch]);

/**
 * Decode entities via DOMParser rather than `element.innerHTML`. A document
 * from DOMParser is inert — no scripts run and no resources are fetched — so a
 * pasted `<img src=x onerror=…>` can never do anything here, whereas assigning
 * innerHTML on a detached node still kicks off image loads in some browsers.
 */
function unescapeHtml(value) {
  const parsed = new DOMParser().parseFromString(value, 'text/html');
  return parsed.documentElement.textContent || '';
}

const toHex = (value) =>
  [...new TextEncoder().encode(value)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

const fromHex = (value) =>
  new TextDecoder().decode(
    Uint8Array.from(value.trim().split(/[\s,]+/).filter(Boolean), (h) => parseInt(h, 16)),
  );

/** Decode the header + payload of a JWT without verifying the signature. */
function decodeJwt(value) {
  const parts = value.trim().split('.');
  if (parts.length < 2) throw new Error('That is not a JWT (expected header.payload.signature).');

  const decodePart = (part) =>
    JSON.parse(base64ToUtf8(part.replace(/-/g, '+').replace(/_/g, '/')));

  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);

  const readable = { ...payload };
  ['exp', 'iat', 'nbf'].forEach((key) => {
    if (typeof payload[key] === 'number') {
      readable[`${key}_readable`] = new Date(payload[key] * 1000).toISOString();
    }
  });

  return JSON.stringify({ header, payload: readable }, null, 2);
}

const MODES = [
  { value: 'base64', label: 'Base64', encode: utf8ToBase64, decode: base64ToUtf8 },
  { value: 'url', label: 'URL', encode: encodeURIComponent, decode: decodeURIComponent },
  { value: 'html', label: 'HTML', encode: escapeHtml, decode: unescapeHtml },
  { value: 'hex', label: 'Hex', encode: toHex, decode: fromHex },
  { value: 'jwt', label: 'JWT', encode: null, decode: decodeJwt },
];

export default function EncoderDecoder() {
  const [mode, setMode] = useState('base64');
  const [direction, setDirection] = useState('encode');
  const [input, setInput] = useState('');

  const active = MODES.find((item) => item.value === mode);
  const decodeOnly = !active.encode;
  const effective = decodeOnly ? 'decode' : direction;

  const { output, error } = useMemo(() => {
    if (!input.trim()) return { output: '', error: '' };

    try {
      const fn = effective === 'encode' ? active.encode : active.decode;
      return { output: fn(input), error: '' };
    } catch (err) {
      return { output: '', error: err.message || 'Could not process that input.' };
    }
  }, [input, active, effective]);

  return (
    <ToolGrid>
      <Panel title="Input" hint="Switch the format and direction — conversion is instant.">
        <Field label="Format">
          <Segmented value={mode} onChange={setMode} options={MODES.map(({ value, label }) => ({ value, label }))} size="sm" label="Format" />
        </Field>

        {!decodeOnly && (
          <Field label="Direction">
            <Segmented
              value={direction}
              onChange={setDirection}
              label="Direction"
              options={[
                { value: 'encode', label: 'Encode' },
                { value: 'decode', label: 'Decode' },
              ]}
              size="sm"
            />
          </Field>
        )}

        <TextArea
          value={input}
          onChange={setInput}
          rows={14}
          className="mono"
          placeholder={decodeOnly ? 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig' : 'Text to convert…'}
        />

        <div className="btn-row">
          {!decodeOnly && output && (
            <Button
              variant="soft"
              icon={<ArrowDownUp size={15} />}
              onClick={() => {
                setInput(output);
                setDirection(direction === 'encode' ? 'decode' : 'encode');
              }}
            >
              Swap and reverse
            </Button>
          )}
          {input && (
            <Button variant="ghost" onClick={() => setInput('')}>
              Clear
            </Button>
          )}
        </div>

        {decodeOnly && (
          <p className="inline-note">
            JWT decoding reads the header and payload only — it does not verify the signature, so
            never trust a token on the strength of what you see here.
          </p>
        )}
      </Panel>

      <Panel
        title="Output"
        hint={effective === 'encode' ? `Encoded as ${active.label}` : `Decoded from ${active.label}`}
        actions={
          output && (
            <Button variant="ghost" onClick={() => copyText(output, 'Output copied')}>
              Copy
            </Button>
          )
        }
      >
        <ErrorNote>{error}</ErrorNote>
        {output ? (
          <pre className="code-block">{output}</pre>
        ) : (
          !error && (
            <EmptyState icon={<Binary size={26} />} title="Result appears here">
              Base64 and hex use a proper UTF-8 round-trip, so emoji and non-Latin scripts survive
              the conversion intact.
            </EmptyState>
          )
        )}
      </Panel>
    </ToolGrid>
  );
}
