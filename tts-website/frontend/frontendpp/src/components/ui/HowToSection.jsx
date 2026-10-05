import { Panel } from './Primitives';
import { useI18n } from '../../i18n';

export default function HowToSection({ steps, title }) {
  const { t } = useI18n();
  if (!steps?.length) return null;

  return (
    <Panel
      className="how-to-panel"
      title={title || t('tool.defaultHowTo')}
      hint={t('tool.howToHint')}
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
