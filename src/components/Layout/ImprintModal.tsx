import React from 'react';
import { X } from 'lucide-react';

interface ImprintModalProps {
  onClose: () => void;
}

export const ImprintModal: React.FC<ImprintModalProps> = ({ onClose }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        maxWidth: '500px',
        width: '90%',
        position: 'relative',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={20} />
        </button>

        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Imprint</h2>
        
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
      </div>
    </div>
  );
};
