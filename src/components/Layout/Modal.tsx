import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  onClose: () => void;
  title: string | React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  width?: string;
  height?: string;
  maxHeight?: string;
  borderRadius?: string;
  padding?: string;
  ariaLabel?: string;
}

/**
 * A reusable Modal component that provides a consistent backdrop and layout.
 */
export const Modal: React.FC<ModalProps> = ({
  onClose,
  title,
  children,
  footer,
  maxWidth = '600px',
  width = '90%',
  height,
  maxHeight = '90vh',
  borderRadius = '8px',
  padding = '24px',
  ariaLabel
}) => {
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
        padding,
        borderRadius,
        maxWidth,
        width,
        height,
        position: 'relative',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        maxHeight,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
          {typeof title === 'string' ? (
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#333' }}>{title}</h2>
          ) : (
            title
          )}
          <button
            onClick={onClose}
            aria-label={ariaLabel || "Close dialog"}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 'var(--touch-target-size)',
              minHeight: 'var(--touch-target-size)',
              color: '#333'
            }}
          >
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1 }}>
          {children}
        </div>

        {footer && (
          <div style={{ marginTop: '20px', flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
