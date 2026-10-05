import { Panel } from './Primitives';

export default function HowToSection({ steps, title = 'How to use this tool' }) {
  if (!steps?.length) return null;

  return (
    <Panel
      className="how-to-panel"
      title={title}
      hint="A simple step-by-step guide to get your result."
    >
      <ol className="how-to-list">
        {steps.map((step, index) => (
          <li key={`${index}-${step}`}>
            <span className="how-to-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="how-to-copy">{step}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
