// src/components/ui/Primitives.test.jsx
// Every tool is built out of these, so a defect here is a defect on 23 pages.
// The label wiring is the part worth pinning down: it is invisible when it
// breaks — the field simply has no accessible name.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  Alert, Button, Checkbox, ErrorNote, Field, Input, Meter, Panel, Range, Segmented, Select, Switch,
  TextArea,
} from './Primitives';

const noop = () => {};

/** The label element and the control it points at, for association checks. */
function wiring(container) {
  const label = container.querySelector('label.field-label');
  const control = container.querySelector('input, textarea, select');
  return { label, control };
}

describe('Field label association', () => {
  it('names a textarea that was given no id of its own', () => {
    const { container } = render(
      <Field label="Your material" hint="12+ characters">
        <TextArea value="" onChange={noop} />
      </Field>,
    );

    const { label, control } = wiring(container);
    expect(control.id).toBeTruthy();
    expect(label.getAttribute('for')).toBe(control.id);
    // The hint is part of the label, so it is announced with the field rather
    // than floating unattached next to it.
    expect(label.textContent).toContain('12+ characters');
  });

  it('names an input and a select the same way', () => {
    const input = render(
      <Field label="Video URL">
        <Input value="" onChange={noop} />
      </Field>,
    );
    expect(wiring(input.container).label.getAttribute('for')).toBe(
      wiring(input.container).control.id,
    );

    const select = render(
      <Field label="Voice">
        <Select value="a" onChange={noop} options={['a', 'b']} />
      </Field>,
    );
    expect(wiring(select.container).label.getAttribute('for')).toBe(
      wiring(select.container).control.id,
    );
  });

  it('lets an explicit id win, so a caller can still own the wiring', () => {
    const { container } = render(
      <Field label="Task" htmlFor="ai-task">
        <Select id="ai-task" value="a" onChange={noop} options={['a']} />
      </Field>,
    );

    const { label, control } = wiring(container);
    expect(control.id).toBe('ai-task');
    expect(label.getAttribute('for')).toBe('ai-task');
  });

  it('mints a different id per field, so two fields never collide', () => {
    const { container } = render(
      <>
        <Field label="Width">
          <Input value="" onChange={noop} />
        </Field>
        <Field label="Height">
          <Input value="" onChange={noop} />
        </Field>
      </>,
    );

    const ids = [...container.querySelectorAll('input')].map((input) => input.id);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('names a radiogroup by reference, since `for` cannot point at one', () => {
    const { container } = render(
      <Field label="Error correction">
        <Segmented value="l" onChange={noop} options={['l', 'm']} />
      </Field>,
    );

    const group = screen.getByRole('radiogroup');
    const label = container.querySelector('label.field-label');

    expect(group.getAttribute('aria-labelledby')).toBe(label.id);
    expect(label.id).toBeTruthy();
    expect(group.getAttribute('aria-label')).toBeNull();
  });

  it('leaves an explicitly labelled radiogroup alone', () => {
    render(
      <Field label="Type">
        <Segmented value="l" onChange={noop} options={['l', 'm']} label="Password type" />
      </Field>,
    );

    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Password type');
    expect(group.getAttribute('aria-labelledby')).toBeNull();
  });
});

describe('Segmented', () => {
  it('exposes one tab stop and marks the selected option', () => {
    render(<Segmented value="b" onChange={noop} options={['a', 'b', 'c']} label="Mode" />);

    const radios = screen.getAllByRole('radio');
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[1].tabIndex).toBe(0);
  });

  it('holds a tab stop even when the value matches no option', () => {
    render(<Segmented value="zzz" onChange={noop} options={['a', 'b']} label="Mode" />);
    expect(screen.getAllByRole('radio')[0].tabIndex).toBe(0);
  });

  it('moves with the arrow keys and wraps around', () => {
    const onChange = vi.fn();
    render(<Segmented value="c" onChange={onChange} options={['a', 'b', 'c']} label="Mode" />);

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('a');

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('ignores keys that are not navigation', () => {
    const onChange = vi.fn();
    render(<Segmented value="a" onChange={onChange} options={['a', 'b']} label="Mode" />);

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'x' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects on click', () => {
    const onChange = vi.fn();
    render(<Segmented value="a" onChange={onChange} options={['a', 'b']} label="Mode" />);

    fireEvent.click(screen.getAllByRole('radio')[1]);
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

/* A phone turns a seven-option row into a hidden-scrollbar scrollport, and a
   selected option outside it makes the control look unset. jsdom has no layout,
   so the geometry is supplied here; item rects are absolute positions offset by
   the current scrollLeft, which is what a browser reports. */
describe('Segmented in a scrollport', () => {
  const OPTIONS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const ITEM = 60;
  const GAP = 2;

  function stubGeometry(container, viewport) {
    const group = container.querySelector('.segmented');
    const items = [...group.querySelectorAll('.segmented-item')];
    const total = items.length * ITEM + (items.length - 1) * GAP;

    Object.defineProperty(group, 'scrollWidth', { configurable: true, get: () => total });
    Object.defineProperty(group, 'clientWidth', { configurable: true, get: () => viewport });
    group.getBoundingClientRect = () => ({ left: 0, right: viewport, width: viewport });

    items.forEach((item, index) => {
      item.getBoundingClientRect = () => {
        const left = index * (ITEM + GAP) - group.scrollLeft;
        return { left, right: left + ITEM, width: ITEM };
      };
    });

    return group;
  }

  it('scrolls right until the selected option is fully visible', () => {
    const { container, rerender } = render(
      <Segmented value="a" onChange={noop} options={OPTIONS} label="Rate" />,
    );
    const group = stubGeometry(container, 306);

    rerender(<Segmented value="g" onChange={noop} options={OPTIONS} label="Rate" />);

    // The last option spans 372–432 in an unscrolled 306px port, so the row
    // moves just far enough to put its right edge on the port's.
    expect(group.scrollLeft).toBe(432 - 306);
  });

  it('scrolls back when the selection moves off the left edge', () => {
    const { container, rerender } = render(
      <Segmented value="a" onChange={noop} options={OPTIONS} label="Rate" />,
    );
    const group = stubGeometry(container, 306);

    rerender(<Segmented value="g" onChange={noop} options={OPTIONS} label="Rate" />);
    rerender(<Segmented value="a" onChange={noop} options={OPTIONS} label="Rate" />);

    expect(group.scrollLeft).toBe(0);
  });

  it('never touches scrollLeft when the whole row already fits', () => {
    const { container, rerender } = render(
      <Segmented value="a" onChange={noop} options={OPTIONS} label="Rate" />,
    );
    const group = stubGeometry(container, 500);

    rerender(<Segmented value="g" onChange={noop} options={OPTIONS} label="Rate" />);

    expect(group.scrollLeft).toBe(0);
  });
});

describe('Button', () => {
  it('says "working", not just "unavailable", while loading', () => {
    render(<Button loading>Generate</Button>);

    const button = screen.getByRole('button');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('is disabled without claiming to be busy', () => {
    render(<Button disabled>Generate</Button>);

    const button = screen.getByRole('button');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBeNull();
  });

  it('never submits a form by accident', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });
});

describe('Alert', () => {
  it('interrupts for a failure and waits its turn for a hint', () => {
    const { unmount } = render(<Alert tone="danger" title="That did not work">Reason</Alert>);
    expect(screen.getByRole('alert').textContent).toContain('Reason');
    unmount();

    render(<Alert tone="info">Just so you know</Alert>);
    expect(screen.getByRole('status').textContent).toContain('Just so you know');
  });
});

describe('ErrorNote', () => {
  it('announces the message, since a silent failure looks like a dead button', () => {
    render(<ErrorNote>Paste some text first.</ErrorNote>);

    const note = screen.getByRole('alert');
    expect(note.textContent).toBe('Paste some text first.');
    expect(note.className).toContain('error-note');
  });

  it('renders nothing at all when there is nothing to say', () => {
    // Callers pass their error state straight in, so the empty case has to be
    // the component's job rather than eleven copies of `{error && …}`.
    const { container } = render(<ErrorNote>{''}</ErrorNote>);
    expect(container.innerHTML).toBe('');
  });
});

describe('TextArea counter', () => {
  it('shows the count against the limit and describes the field with it', () => {
    const { container } = render(<TextArea value="hello" onChange={noop} maxLength={1000} />);

    const textarea = container.querySelector('textarea');
    const counter = container.querySelector('.textarea-counter');

    expect(counter.textContent).toBe('5 / 1,000');
    expect(textarea.getAttribute('aria-describedby')).toContain(counter.id);
  });

  it('reports the edited value to its owner', () => {
    const onChange = vi.fn();
    render(<TextArea value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'typed' } });
    expect(onChange).toHaveBeenCalledWith('typed');
  });
});

describe('Range', () => {
  it('is labelled by its field and announces the unit', () => {
    const { container } = render(
      <Field label="Size">
        <Range value={512} onChange={noop} min={120} max={1024} step={8} suffix="px" />
      </Field>,
    );

    const slider = screen.getByRole('slider');
    expect(container.querySelector('label.field-label').getAttribute('for')).toBe(slider.id);
    expect(slider.getAttribute('aria-valuetext')).toBe('512px');
    expect(container.querySelector('.range-value').textContent).toBe('512px');
  });

  it('hands back a number rather than the string the input carries', () => {
    const onChange = vi.fn();
    render(<Range value={4} onChange={onChange} min={0} max={10} />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe('Switch', () => {
  it('is a real checkbox with the visible text as its name', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Stream the answer" hint="live" />);

    const box = screen.getByRole('checkbox', { name: /Stream the answer/ });
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Checkbox', () => {
  it('is a real checkbox named by its visible text, drawn box and all', () => {
    const { container } = render(
      <Checkbox checked onChange={noop} label="Sort object keys" hint="a–z" />,
    );

    const box = screen.getByRole('checkbox', { name: /Sort object keys/ });
    expect(box.checked).toBe(true);
    // The painted box is decoration; the input above it carries the state.
    expect(container.querySelector('.check-box').getAttribute('aria-hidden')).toBe('true');
  });

  it('reports the next state rather than the event', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Numbers" />);

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('disables the real input, so the platform is what blocks the click', () => {
    // Asserted on the input rather than by clicking it: fireEvent dispatches
    // straight at the node and skips the disabled check a browser applies.
    const { container } = render(
      <Checkbox checked={false} onChange={noop} label="Symbols" disabled />,
    );

    expect(screen.getByRole('checkbox').disabled).toBe(true);
    expect(container.querySelector('.check').className).toContain('is-disabled');
  });
});

describe('Meter', () => {
  it('clamps a value that falls outside the range', () => {
    const { unmount } = render(<Meter value={250} label="Strength" />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('100');
    unmount();

    render(<Meter value={-4} label="Strength" />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('Panel', () => {
  it('titles itself with an h2, the level below a tool page heading', () => {
    render(<Panel title="Source">body</Panel>);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Source');
  });

  it('drops to the requested level for a nested panel', () => {
    render(<Panel title="Nested" headingLevel={3}>body</Panel>);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Nested');
  });

  it('renders no header at all when there is nothing to put in it', () => {
    const { container } = render(<Panel>body</Panel>);
    expect(container.querySelector('.panel-head')).toBeNull();
  });
});
