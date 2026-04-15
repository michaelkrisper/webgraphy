import React from 'react';
import { type Theme } from '../../themes';

interface CollapsedMenuButtonProps {
  onClick: () => void;
  theme: Theme;
}

export const CollapsedMenuButton: React.FC<CollapsedMenuButtonProps> = ({ onClick, theme }) => {
  const bg = theme.accent;
  const color = '#ffffff';
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        padding: '12px 24px',
        borderRadius: '8px',
        background: bg,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        transition: 'all 0.2s ease',
        fontWeight: 'bold',
        fontSize: '14px',
        color,
        minWidth: '80px',
        minHeight: '44px'
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
      title="Open Menu"
      aria-label="Open Menu"
    >
      Menu
    </button>
  );
};
