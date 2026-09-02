// src/tools/Notepad.jsx
// Multi-note scratchpad persisted in localStorage — survives a refresh.

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Notebook, Plus, Trash2 } from 'lucide-react';
import useLocalStorage from '../hooks/useLocalStorage';
import { copyText, downloadText } from '../lib/utils';
import { Button, Panel, TextArea, ToolGrid } from '../components/ui/Primitives';
import { Stat, StatRow } from '../components/ui/Display';

const blankNote = () => ({
  id: `n${Date.now()}`,
  title: 'Untitled note',
  body: '',
  updated: Date.now(),
});

/** First non-empty line becomes the note's title in the list. */
const titleFrom = (body) => {
  const line = body.split('\n').find((candidate) => candidate.trim());
  return line ? line.trim().slice(0, 48) : 'Untitled note';
};

export default function Notepad() {
  const [notes, setNotes] = useLocalStorage('vf.notes', [blankNote()]);
  const [activeId, setActiveId] = useState(null);

  // A stable placeholder so an empty store still renders one editable note
  // without an effect having to write state during render.
  const fallback = useMemo(() => blankNote(), []);
  const list = notes.length ? notes : [fallback];
  const active = list.find((note) => note.id === activeId) || list[0];

  const update = (body) =>
    setNotes(
      list.map((note) =>
        note.id === active.id ? { ...note, body, title: titleFrom(body), updated: Date.now() } : note,
      ),
    );

  const add = () => {
    const fresh = blankNote();
    setNotes([fresh, ...list]);
    setActiveId(fresh.id);
  };

  const remove = (id) => {
    const left = list.filter((note) => note.id !== id);
    const next = left.length ? left : [blankNote()];
    setNotes(next);
    if (id === active.id) setActiveId(next[0].id);
    toast.success('Note deleted');
  };

  const body = active.body || '';
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <ToolGrid>
      <Panel
        title="Notes"
        hint={`${list.length} saved in this browser`}
        actions={
          <Button variant="soft" icon={<Plus size={15} />} onClick={add}>
            New
          </Button>
        }
      >
        <div className="note-list">
          {list.map((note) => (
            <div className={`note-item${note.id === active.id ? ' active' : ''}`} key={note.id}>
              <button type="button" className="note-item-body" onClick={() => setActiveId(note.id)}>
                <strong>{note.title}</strong>
                <small>{new Date(note.updated).toLocaleString()}</small>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${note.title}`}
                onClick={() => remove(note.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <p className="inline-note">
          Notes live in this browser's storage only — nothing is uploaded, and clearing site data
          removes them.
        </p>
      </Panel>

      <Panel
        title={active.title || 'Note'}
        hint="Saves as you type"
        actions={
          body && (
            <>
              <Button variant="ghost" onClick={() => copyText(body, 'Note copied')}>
                Copy
              </Button>
              <Button
                variant="ghost"
                icon={<Download size={15} />}
                onClick={() => downloadText(`${(active.title || 'note').replace(/\W+/g, '-')}.txt`, body)}
              >
                .txt
              </Button>
            </>
          )
        }
      >
        <TextArea
          value={body}
          onChange={update}
          rows={20}
          counter={false}
          placeholder="Start writing — the first line becomes the title…"
        />
        <StatRow>
          <Stat label="Words" value={words.toLocaleString()} />
          <Stat label="Characters" value={body.length.toLocaleString()} />
          <Stat label="Lines" value={body ? body.split('\n').length : 0} />
        </StatRow>
        {!body && (
          <p className="muted-line">
            <Notebook size={13} /> Tip: keep one note per project — the list is sorted newest-first.
          </p>
        )}
      </Panel>
    </ToolGrid>
  );
}
