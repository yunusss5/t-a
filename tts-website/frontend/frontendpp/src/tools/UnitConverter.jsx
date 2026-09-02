// src/tools/UnitConverter.jsx
// Length, weight, temperature, data, speed, area, volume and time.

import { useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { copyText } from '../lib/utils';
import {
  Button, Field, Input, Panel, Select, ToolGrid,
} from '../components/ui/Primitives';

/* Every category except temperature converts through a base-unit factor. */
const CATEGORIES = {
  length: {
    label: 'Length',
    units: {
      mm: ['Millimetre', 0.001], cm: ['Centimetre', 0.01], m: ['Metre', 1], km: ['Kilometre', 1000],
      in: ['Inch', 0.0254], ft: ['Foot', 0.3048], yd: ['Yard', 0.9144], mi: ['Mile', 1609.344],
    },
  },
  weight: {
    label: 'Weight',
    units: {
      mg: ['Milligram', 0.000001], g: ['Gram', 0.001], kg: ['Kilogram', 1], t: ['Tonne', 1000],
      oz: ['Ounce', 0.0283495], lb: ['Pound', 0.453592], st: ['Stone', 6.35029],
    },
  },
  temperature: { label: 'Temperature', units: { c: ['Celsius', 1], f: ['Fahrenheit', 1], k: ['Kelvin', 1] } },
  data: {
    label: 'Data',
    units: {
      b: ['Byte', 1], kb: ['Kilobyte', 1024], mb: ['Megabyte', 1024 ** 2],
      gb: ['Gigabyte', 1024 ** 3], tb: ['Terabyte', 1024 ** 4],
    },
  },
  speed: {
    label: 'Speed',
    units: {
      mps: ['Metres / second', 1], kmh: ['km / h', 0.277778], mph: ['Miles / h', 0.44704],
      knot: ['Knot', 0.514444],
    },
  },
  area: {
    label: 'Area',
    units: {
      sqm: ['Square metre', 1], sqft: ['Square foot', 0.092903], sqkm: ['Square km', 1000000],
      acre: ['Acre', 4046.86], hectare: ['Hectare', 10000],
    },
  },
  volume: {
    label: 'Volume',
    units: {
      ml: ['Millilitre', 0.001], l: ['Litre', 1], cup: ['Cup (US)', 0.236588],
      pt: ['Pint (US)', 0.473176], gal: ['Gallon (US)', 3.78541],
    },
  },
  time: {
    label: 'Time',
    units: {
      ms: ['Millisecond', 0.001], s: ['Second', 1], min: ['Minute', 60], h: ['Hour', 3600],
      d: ['Day', 86400], wk: ['Week', 604800],
    },
  },
};

function convertTemperature(value, from, to) {
  const celsius = from === 'c' ? value : from === 'f' ? (value - 32) / 1.8 : value - 273.15;
  if (to === 'c') return celsius;
  if (to === 'f') return celsius * 1.8 + 32;
  return celsius + 273.15;
}

/** Trim float noise without losing precision on very small values. */
function tidy(value) {
  if (!Number.isFinite(value)) return '—';
  if (value !== 0 && Math.abs(value) < 0.000001) return value.toExponential(4);
  return String(Number(value.toPrecision(10)));
}

export default function UnitConverter() {
  const [category, setCategory] = useState('length');
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('m');
  const [to, setTo] = useState('ft');

  const units = CATEGORIES[category].units;

  const options = useMemo(
    () => Object.entries(units).map(([key, [label]]) => ({ value: key, label })),
    [units],
  );

  const switchCategory = (next) => {
    const keys = Object.keys(CATEGORIES[next].units);
    setCategory(next);
    setFrom(keys[0]);
    setTo(keys[1] || keys[0]);
  };

  const numeric = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(numeric);

  const result = useMemo(() => {
    if (!valid || !units[from] || !units[to]) return null;
    if (category === 'temperature') return convertTemperature(numeric, from, to);
    return (numeric * units[from][1]) / units[to][1];
  }, [valid, numeric, category, from, to, units]);

  const all = useMemo(() => {
    if (!valid) return [];
    return Object.keys(units).map((key) => ({
      key,
      label: units[key][0],
      value:
        category === 'temperature'
          ? convertTemperature(numeric, from, key)
          : (numeric * units[from][1]) / units[key][1],
    }));
  }, [valid, numeric, category, from, units]);

  return (
    <ToolGrid>
      <Panel title="Convert" hint="Eight categories, 40+ units.">
        <Field label="Category">
          <Select
            value={category}
            onChange={switchCategory}
            options={Object.entries(CATEGORIES).map(([key, { label }]) => ({ value: key, label }))}
          />
        </Field>

        <Field label="Amount">
          <Input value={amount} onChange={setAmount} type="number" step="any" />
        </Field>

        <div className="field-row">
          <Field label="From">
            <Select value={from} onChange={setFrom} options={options} />
          </Field>
          <Field label="To">
            <Select value={to} onChange={setTo} options={options} />
          </Field>
        </div>

        <div className="btn-row">
          <Button
            variant="soft"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            Swap units
          </Button>
        </div>

        <div className="mono-out">
          {result === null ? 'Enter a number' : `${tidy(result)} ${units[to][0]}`}
        </div>

        {result !== null && (
          <div className="btn-row">
            <Button variant="ghost" icon={<Ruler size={15} />} onClick={() => copyText(tidy(result), 'Result copied')}>
              Copy result
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Every unit" hint={`${amount || '0'} ${units[from]?.[0] || ''} in each unit`}>
        <div className="kv-list">
          {all.map((item) => (
            <div className="kv-row" key={item.key}>
              <span>{item.label}</span>
              <span>{tidy(item.value)}</span>
            </div>
          ))}
        </div>
        {!valid && <p className="muted-line">Enter a valid number to see the full table.</p>}
      </Panel>
    </ToolGrid>
  );
}
