import { useEffect, useRef, useState } from 'react';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import { chatAssistant } from '../../lib/ai';

const STARTER_PROMPTS = [
  'Which tool should I use to edit audio?',
  'Help me make a video title more engaging.',
];

export default function AssistantChat() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, busy]);

  const submit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;

    const history = [...messages, { role: 'user', content }].slice(-12);
    setMessages(history);
    setDraft('');
    setError('');
    setBusy(true);

    try {
      const response = await chatAssistant(history);
      setMessages([...history, { role: 'assistant', content: response.text }]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="assistant-chat">
      <p className="assistant-chat-note">
        Ask about your creative workflow or get help choosing a tool. No personal API key needed.
      </p>

      <div className="assistant-chat-messages" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 ? (
          <div className="assistant-chat-starters">
            {STARTER_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => setDraft(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          messages.map((message, index) => (
            <p key={`${index}-${message.role}`} className={`assistant-message ${message.role}`}>
              {message.content}
            </p>
          ))
        )}
        {busy && (
          <p className="assistant-message assistant" role="status">
            <LoaderCircle size={15} className="spin" aria-hidden="true" /> Thinking…
          </p>
        )}
        <span ref={endRef} />
      </div>

      {error && <p className="assistant-chat-error" role="alert">{error}</p>}

      <form className="assistant-chat-form" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={4000}
          rows={2}
          placeholder="Message the assistant…"
          aria-label="Message the assistant"
        />
        <button type="submit" disabled={!draft.trim() || busy} aria-label="Send message">
          <ArrowUp size={17} aria-hidden="true" />
        </button>
      </form>
      <small className="assistant-chat-privacy">
        Your messages are sent to the site’s configured model and are not saved.
      </small>
    </div>
  );
}
