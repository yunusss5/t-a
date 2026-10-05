// src/components/ui/FaqSection.jsx
// A tool page's visible FAQ block, rendered from the tool's `faqs` data.
//
// The same questions feed the page's FAQPage structured data at build time
// (lib/seo.js), so what the page shows and what the schema claims can never
// drift. Only tools with genuine question-and-answer content carry a `faqs`
// array — FAQPage markup without visible answers is a schema violation.

import { Panel } from './Primitives';

export default function FaqSection({ faqs, title = 'Frequently asked questions' }) {
  if (!faqs?.length) return null;

  return (
    <Panel
      className="faq-panel"
      title={title}
      hint="Clear answers to common questions about this tool."
    >
      <div className="faq-list">
        {faqs.map(({ question, answer }, index) => (
          <details key={question} className="faq-item">
            <summary>
              <span className="faq-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="faq-question">{question}</span>
              <span className="faq-toggle" aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </Panel>
  );
}
