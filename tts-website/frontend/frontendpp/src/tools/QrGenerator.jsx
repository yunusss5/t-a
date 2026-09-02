// src/tools/QrGenerator.jsx
// PNG + SVG QR codes with custom colours, size and error correction.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { Download, QrCode } from 'lucide-react';
import { downloadText } from '../lib/utils';
import {
  Button, ErrorNote, Field, Input, Panel, Range, Segmented, TextArea, ToolGrid,
} from '../components/ui/Primitives';
import { EmptyState } from '../components/ui/Display';

const LEVELS = [
  { value: 'L', label: 'L · 7%' },
  { value: 'M', label: 'M · 15%' },
  { value: 'Q', label: 'Q · 25%' },
  { value: 'H', label: 'H · 30%' },
];

const PRESETS = [
  ['Website', 'https://'],
  ['UPI payment', 'upi://pay?pa=name@bank&pn=Name&cu=INR'],
  ['WiFi', 'WIFI:T:WPA;S:NetworkName;P:password;;'],
  ['Email', 'mailto:hello@example.com?subject=Hi'],
  ['Phone', 'tel:+911234567890'],
  ['WhatsApp', 'https://wa.me/911234567890'],
];

export default function QrGenerator() {
  const [value, setValue] = useState('http://localhost:5174');
  const [size, setSize] = useState(320);
  const [margin, setMargin] = useState(2);
  const [level, setLevel] = useState('M');
  const [dark, setDark] = useState('#141018');
  const [light, setLight] = useState('#ffffff');
  const [result, setResult] = useState({ png: '', svg: '', error: '' });

  const trimmed = value.trim();

  // qrcode is async, so state is only written from the promise continuation and
  // a cancellation flag keeps a slow render from overwriting a newer one.
  useEffect(() => {
    if (!trimmed) return undefined;

    let cancelled = false;
    const options = {
      width: size,
      margin,
      errorCorrectionLevel: level,
      color: { dark, light },
    };

    Promise.all([
      QRCode.toDataURL(trimmed, options),
      QRCode.toString(trimmed, { ...options, type: 'svg' }),
    ])
      .then(([dataUrl, markup]) => {
        if (!cancelled) setResult({ png: dataUrl, svg: markup, error: '' });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ png: '', svg: '', error: err.message || 'That value is too long for a single QR code.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [trimmed, size, margin, level, dark, light]);

  const { png, svg, error } = trimmed ? result : { png: '', svg: '', error: '' };

  const downloadPng = () => {
    const link = document.createElement('a');
    link.href = png;
    link.download = 'qr-code.png';
    link.click();
    toast.success('PNG downloaded');
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Content" hint="Any text, link, UPI string or WiFi config.">
          <TextArea value={value} onChange={setValue} rows={4} placeholder="https://…" />
          <Field label="Quick presets">
            <div className="chip-wrap">
              {PRESETS.map(([label, template]) => (
                <button type="button" className="chip" key={label} onClick={() => setValue(template)}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </Panel>

        <Panel title="Appearance">
          <Field label="Size" hint={`${size}px`}>
            <Range value={size} onChange={setSize} min={120} max={1024} step={8} suffix="px" />
          </Field>

          <Field label="Quiet zone" hint={`${margin} modules`}>
            <Range value={margin} onChange={setMargin} min={0} max={8} />
          </Field>

          <Field label="Error correction" hint="higher survives more damage">
            <Segmented value={level} onChange={setLevel} options={LEVELS} size="sm" label="Error correction" />
          </Field>

          <div className="field-row">
            <Field label="Foreground">
              <Input value={dark} onChange={setDark} type="color" />
            </Field>
            <Field label="Background">
              <Input value={light} onChange={setLight} type="color" />
            </Field>
          </div>

          <p className="muted-line">
            Keep strong contrast between the two colours — scanners read the pattern, not the hue.
          </p>
        </Panel>
      </div>

      <Panel
        title="Preview"
        actions={
          png && (
            <>
              <Button variant="ghost" icon={<Download size={15} />} onClick={downloadPng}>
                PNG
              </Button>
              <Button
                variant="ghost"
                icon={<Download size={15} />}
                onClick={() => downloadText('qr-code.svg', svg, 'image/svg+xml')}
              >
                SVG
              </Button>
            </>
          )
        }
      >
        <ErrorNote>{error}</ErrorNote>
        {png ? (
          <>
            <div className="media-preview" style={{ background: light }}>
              <img src={png} alt="QR code preview" style={{ width: Math.min(size, 320) }} />
            </div>
            <p className="muted-line center">
              SVG scales to any print size without blurring; PNG is easier to paste into slides.
            </p>
          </>
        ) : (
          !error && (
            <EmptyState icon={<QrCode size={26} />} title="Type something to generate a code">
              Everything is rendered locally, so private links never touch a server.
            </EmptyState>
          )
        )}
      </Panel>
    </ToolGrid>
  );
}
