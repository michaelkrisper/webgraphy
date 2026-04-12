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
      <p style={{ lineHeight: '1.6', color: '#444' }}>
        <strong>Michael Krisper</strong><br />
        GitHub Repository: <br />
        <a href="https://github.com/michaelkrisper/webgraphy" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>
          https://github.com/michaelkrisper/webgraphy
        </a>
      </p>

      <p style={{ fontSize: '0.85em', color: '#666', marginTop: '30px', lineHeight: '1.5' }}>
        This open-source project provides high-performance data visualization in the browser.
      </p>
    </Modal>
  );
};
