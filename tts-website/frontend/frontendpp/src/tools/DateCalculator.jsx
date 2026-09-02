// src/tools/DateCalculator.jsx
// Age, difference between two dates, and add/subtract from a date.

import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { copyText } from '../lib/utils';
import {
  Button, Field, Input, Panel, Segmented, Select, ToolGrid,
} from '../components/ui/Primitives';
import { CopyRow, Stat, StatRow } from '../components/ui/Display';

const MODES = [
  { value: 'difference', label: 'Between dates' },
  { value: 'age', label: 'Age' },
  { value: 'offset', label: 'Add / subtract' },
];

const UNITS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
];

const DAY = 86400000;
const isoToday = () => new Date().toISOString().slice(0, 10);

/** Calendar-aware Y/M/D breakdown between two dates. */
function breakdown(from, to) {
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days };
}

function countWeekdays(from, to) {
  let weekdays = 0;
  const cursor = new Date(from.getTime());

  while (cursor < to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) weekdays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return weekdays;
}

const pretty = (date) =>
  date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

export default function DateCalculator() {
  const [mode, setMode] = useState('difference');
  const [start, setStart] = useState(isoToday());
  const [end, setEnd] = useState(isoToday());
  const [birth, setBirth] = useState('2000-01-01');
  const [amount, setAmount] = useState('30');
  const [unit, setUnit] = useState('days');

  const difference = useMemo(() => {
    const from = new Date(start);
    const to = new Date(end);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;

    const [early, late] = from <= to ? [from, to] : [to, from];
    const totalDays = Math.round((late - early) / DAY);

    return {
      ...breakdown(early, late),
      totalDays,
      weeks: Math.floor(totalDays / 7),
      weekdays: countWeekdays(early, late),
      hours: totalDays * 24,
    };
  }, [start, end]);

  const age = useMemo(() => {
    const from = new Date(birth);
    if (Number.isNaN(from.getTime())) return null;

    const now = new Date();
    const parts = breakdown(from, now);
    const totalDays = Math.floor((now - from) / DAY);

    const next = new Date(now.getFullYear(), from.getMonth(), from.getDate());
    if (next < now) next.setFullYear(next.getFullYear() + 1);

    return {
      ...parts,
      totalDays,
      months: parts.months,
      nextBirthday: next,
      daysToBirthday: Math.ceil((next - now) / DAY),
    };
  }, [birth]);

  const offset = useMemo(() => {
    const base = new Date(start);
    const value = Number(amount);
    if (Number.isNaN(base.getTime()) || !Number.isFinite(value)) return null;

    const result = new Date(base.getTime());
    if (unit === 'days') result.setDate(result.getDate() + value);
    if (unit === 'weeks') result.setDate(result.getDate() + value * 7);
    if (unit === 'months') result.setMonth(result.getMonth() + value);
    if (unit === 'years') result.setFullYear(result.getFullYear() + value);

    return result;
  }, [start, amount, unit]);

  return (
    <ToolGrid>
      <Panel title="Dates" hint="Calendar-aware — leap years and month lengths included.">
        <Field label="What do you need?">
          <Segmented value={mode} onChange={setMode} options={MODES} size="sm" label="What do you need?" />
        </Field>

        {mode === 'age' ? (
          <Field label="Date of birth">
            <Input value={birth} onChange={setBirth} type="date" />
          </Field>
        ) : (
          <>
            <Field label={mode === 'offset' ? 'Starting date' : 'From'}>
              <Input value={start} onChange={setStart} type="date" />
            </Field>

            {mode === 'difference' ? (
              <Field label="To">
                <Input value={end} onChange={setEnd} type="date" />
              </Field>
            ) : (
              <div className="field-row">
                <Field label="Amount" hint="negative to go back">
                  <Input value={amount} onChange={setAmount} type="number" />
                </Field>
                <Field label="Unit">
                  <Select value={unit} onChange={setUnit} options={UNITS} />
                </Field>
              </div>
            )}
          </>
        )}

        <div className="btn-row">
          <Button
            variant="soft"
            icon={<CalendarClock size={15} />}
            onClick={() => {
              setStart(isoToday());
              setEnd(isoToday());
            }}
          >
            Reset to today
          </Button>
        </div>
      </Panel>

      <Panel title="Result">
        {mode === 'difference' && difference && (
          <>
            <div className="mono-out">
              {difference.years}y {difference.months}m {difference.days}d
            </div>
            <StatRow>
              <Stat label="Total days" value={difference.totalDays.toLocaleString()} />
              <Stat label="Weeks" value={difference.weeks.toLocaleString()} />
              <Stat label="Weekdays" value={difference.weekdays.toLocaleString()} />
              <Stat label="Hours" value={difference.hours.toLocaleString()} />
            </StatRow>
            <CopyRow label="Summary" value={`${difference.totalDays} days (${difference.years}y ${difference.months}m ${difference.days}d)`} />
          </>
        )}

        {mode === 'age' && age && (
          <>
            <div className="mono-out">
              {age.years} years, {age.months} months, {age.days} days
            </div>
            <StatRow>
              <Stat label="Days alive" value={age.totalDays.toLocaleString()} />
              <Stat label="Weeks" value={Math.floor(age.totalDays / 7).toLocaleString()} />
              <Stat label="Next birthday" value={age.daysToBirthday} hint="days away" tone="good" />
              <Stat label="Turning" value={age.years + 1} />
            </StatRow>
            <CopyRow label="Next birthday" value={pretty(age.nextBirthday)} />
          </>
        )}

        {mode === 'offset' && offset && (
          <>
            <div className="mono-out">{offset.toISOString().slice(0, 10)}</div>
            <CopyRow label="Full date" value={pretty(offset)} />
            <StatRow>
              <Stat label="Day" value={offset.toLocaleDateString(undefined, { weekday: 'short' })} />
              <Stat label="Week of year" value={Math.ceil((offset - new Date(offset.getFullYear(), 0, 1)) / DAY / 7) || 1} />
              <Stat label="From today" value={Math.round((offset - new Date()) / DAY)} hint="days" />
            </StatRow>
            <div className="btn-row end">
              <Button variant="ghost" onClick={() => copyText(offset.toISOString().slice(0, 10), 'Date copied')}>
                Copy ISO date
              </Button>
            </div>
          </>
        )}

        {((mode === 'difference' && !difference) ||
          (mode === 'age' && !age) ||
          (mode === 'offset' && !offset)) && (
          <p className="muted-line center">Pick a valid date to see the result.</p>
        )}
      </Panel>
    </ToolGrid>
  );
}
