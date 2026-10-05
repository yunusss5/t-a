import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import AssistantChat from './AssistantChat';

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);

  return (
    <aside className="assistant-widget">
      {open && (
        <section className="assistant-widget-panel" aria-label="AI Assistant">
          <header className="assistant-widget-header">
            <div>
              <strong>AI Assistant</strong>
              <small>Help for your creative work</small>
            </div>
            <div className="assistant-widget-actions">
              <Link to="/tools/ai-assistant" onClick={() => setOpen(false)}>
                Full page
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          </header>
          <AssistantChat />
        </section>
      )}

      <button
        type="button"
        className="assistant-widget-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Close assistant' : 'Open AI Assistant'}
      >
        {open ? <X size={19} aria-hidden="true" /> : <MessageCircle size={19} aria-hidden="true" />}
        <span>{open ? 'Close' : 'Ask Assistant'}</span>
      </button>
    </aside>
  );
}
