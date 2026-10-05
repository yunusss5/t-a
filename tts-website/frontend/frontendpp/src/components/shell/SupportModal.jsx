// src/components/shell/SupportModal.jsx
import { Copy } from 'lucide-react';
import Modal from '../ui/Modal';
import { copyText } from '../../lib/utils';
import { useI18n } from '../../i18n';

const UPI_ID = 'gause700ybl';

/** Donation details. All dialog behaviour lives in the shared Modal. */
export default function SupportModal({ open, onClose }) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('support.title')}
      lead={t('support.description')}
    >
      <div className="qr-block">
        <img
          src="/qr-support.png"
          alt={`${t('support.upiId')} QR code`}
          width="168"
          height="168"
          loading="lazy"
          decoding="async"
        />
        <p className="qr-caption">{t('support.scan')}</p>
      </div>

      <button type="button" className="upi-row" onClick={() => copyText(UPI_ID, t('support.copied'))}>
        <span className="upi-label">{t('support.upiId')}</span>
        <span className="upi-value">{UPI_ID}</span>
        <Copy size={15} aria-hidden="true" />
      </button>
    </Modal>
  );
}
