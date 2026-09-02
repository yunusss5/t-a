// src/tools/ColorStudio.jsx
// Colour conversion, generated palettes and WCAG contrast checking.

import { useMemo, useState } from 'react';
import { Palette } from 'lucide-react';
import { copyText, clamp } from '../lib/utils';
import { Button, Field, Input, Panel, ToolGrid } from '../components/ui/Primitives';
import { CopyRow, Stat, StatRow } from '../components/ui/Display';

/* ---------- Conversion helpers ---------- */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean;
  const int = parseInt(full.slice(0, 6).padEnd(6, '0'), 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

const toHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb({ h, s, l }) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  const seg = Math.floor(h / 60) % 6;

  const table = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return { r: (table[0] + m) * 255, g: (table[1] + m) * 255, b: (table[2] + m) * 255 };
}

/** Relative luminance per WCAG 2.1. */
function luminance({ r, g, b }) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const shift = (hsl, dh) => ({ ...hsl, h: (hsl.h + dh + 360) % 360 });

export default function ColorStudio() {
  const [hex, setHex] = useState('#7c6df0');
  const [against, setAgainst] = useState('#ffffff');

  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const hsl = useMemo(() => rgbToHsl(rgb), [rgb]);

  const shades = useMemo(
    () =>
      [95, 85, 75, 65, 55, 45, 35, 25, 15].map((l) => ({
        label: `${l}%`,
        hex: toHex(hslToRgb({ ...hsl, l })),
      })),
    [hsl],
  );

  const harmonies = useMemo(
    () => [
      ['Complementary', shift(hsl, 180)],
      ['Triadic +', shift(hsl, 120)],
      ['Triadic −', shift(hsl, 240)],
      ['Analogous +', shift(hsl, 30)],
      ['Analogous −', shift(hsl, -30)],
      ['Split +', shift(hsl, 150)],
      ['Split −', shift(hsl, 210)],
    ].map(([label, value]) => ({ label, hex: toHex(hslToRgb(value)) })),
    [hsl],
  );

  const ratio = useMemo(() => contrastRatio(rgb, hexToRgb(against)), [rgb, against]);
  const rounded = Math.round(ratio * 100) / 100;

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Colour" hint="Pick, paste a HEX, or type one in.">
          <div className="color-hero" style={{ background: hex }} />
          <div className="field-row">
            <Field label="Picker">
              <Input value={hex} onChange={setHex} type="color" />
            </Field>
            <Field label="HEX">
              <Input value={hex} onChange={(v) => setHex(v.startsWith('#') ? v : `#${v}`)} className="mono" />
            </Field>
          </div>
          <CopyRow label="HEX" value={hex.toUpperCase()} />
          <CopyRow label="RGB" value={`rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`} />
          <CopyRow label="HSL" value={`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`} />
          <CopyRow
            label="CSS variable"
            value={`--brand: ${hex.toUpperCase()};`}
          />
        </Panel>

        <Panel title="Contrast" hint="WCAG 2.1 · text against a background">
          <Field label="Compare against">
            <Input value={against} onChange={setAgainst} type="color" />
          </Field>
          <div
            className="media-preview"
            style={{ background: against, color: hex, fontWeight: 600, padding: '1.4rem' }}
          >
            <span>Sample text at this pairing</span>
          </div>
          <StatRow>
            <Stat label="Ratio" value={`${rounded}:1`} tone={ratio >= 4.5 ? 'good' : ratio >= 3 ? 'warn' : 'bad'} />
            <Stat label="AA body" value={ratio >= 4.5 ? 'Pass' : 'Fail'} tone={ratio >= 4.5 ? 'good' : 'bad'} />
            <Stat label="AA large" value={ratio >= 3 ? 'Pass' : 'Fail'} tone={ratio >= 3 ? 'good' : 'bad'} />
            <Stat label="AAA body" value={ratio >= 7 ? 'Pass' : 'Fail'} tone={ratio >= 7 ? 'good' : 'warn'} />
          </StatRow>
        </Panel>
      </div>

      <div className="stack">
        <Panel title="Shades" hint="Same hue, stepped lightness — click to copy.">
          <div className="swatch-grid">
            {shades.map((shade) => (
              <button type="button" className="swatch" key={shade.label} onClick={() => copyText(shade.hex, `${shade.hex} copied`)}>
                <span className="swatch-fill" style={{ background: shade.hex }} />
                <span className="swatch-label">{shade.hex}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Harmonies" hint="Rotations around the colour wheel">
          <div className="swatch-grid">
            {harmonies.map((item) => (
              <button type="button" className="swatch" key={item.label} onClick={() => copyText(item.hex, `${item.hex} copied`)}>
                <span className="swatch-fill" style={{ background: item.hex }} />
                <span className="swatch-label">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="btn-row">
            <Button
              variant="soft"
              icon={<Palette size={15} />}
              onClick={() =>
                copyText(
                  [hex, ...harmonies.map((h) => h.hex)].join(', '),
                  'Palette copied',
                )
              }
            >
              Copy full palette
            </Button>
          </div>
        </Panel>
      </div>
    </ToolGrid>
  );
}
