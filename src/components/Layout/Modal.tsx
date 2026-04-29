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
    <div className="modal-overlay">
      <div className="modal-card" style={{ padding, borderRadius, maxWidth, width, height, maxHeight }}>
        <div className="modal-header">
          {typeof title === 'string' ? (
            <h2 className="modal-title">{title}</h2>
          ) : (
            title
          )}
          <button onClick={onClose} aria-label={ariaLabel || "Close dialog"} className="modal-close">
            <X size={24} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};
