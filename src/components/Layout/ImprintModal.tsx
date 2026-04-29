import React from 'react';
import { Modal } from './Modal';

interface ImprintModalProps {
  onClose: () => void;
}

export const ImprintModal: React.FC<ImprintModalProps> = ({ onClose }) => {
  return (
    <Modal
      onClose={onClose}
      title="Imprint"
      maxWidth="500px"
      ariaLabel="Close Imprint"
    >
      <p className="imprint-text">
        <strong>Michael Krisper</strong><br />
        GitHub Repository: <br />
        <a href="https://github.com/michaelkrisper/webgraphy" target="_blank" rel="noopener noreferrer" className="imprint-link">
          https://github.com/michaelkrisper/webgraphy
        </a>
      </p>

      <p className="imprint-note">
        This open-source project provides high-performance data visualization in the browser.
      </p>
    </Modal>
  );
};
