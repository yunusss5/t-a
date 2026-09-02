// src/components/shell/SupportModal.jsx
import { Copy } from 'lucide-react';
import Modal from '../ui/Modal';
import { copyText } from '../../lib/utils';

const UPI_ID = 'gause700ybl';

/** Donation details. All dialog behaviour lives in the shared Modal. */
export default function SupportModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Support the team"
      lead="Every tool here is free, has no sign-up and no ads. If it saved you time today, a small tip keeps the servers running."
    >
      <div className="qr-block">
        <img
          src="/qr-support.png"
          alt="QR code for the UPI ID gause700ybl"
          width="168"
          height="168"
          loading="lazy"
          decoding="async"
        />
        <p className="qr-caption">Scan with any UPI app</p>
      </div>

      <button type="button" className="upi-row" onClick={() => copyText(UPI_ID, 'UPI ID copied')}>
        <span className="upi-label">UPI ID</span>
        <span className="upi-value">{UPI_ID}</span>
        <Copy size={15} aria-hidden="true" />
      </button>
    </Modal>
  );
}
