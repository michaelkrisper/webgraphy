import React from 'react';
import { type Theme } from '../../themes';

interface CollapsedMenuButtonProps {
  onClick: () => void;
  theme: Theme;
}

export const CollapsedMenuButton: React.FC<CollapsedMenuButtonProps> = ({ onClick }) => (
  <button
    onClick={onClick}
    style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      padding: '4px',
      borderRadius: '4px',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }}
    title="Open Menu"
    aria-label="Open Menu"
  >
    <img src="./favicon.svg" style={{ width: 22, height: 22 }} alt="webgraphy logo" />
  </button>
);
