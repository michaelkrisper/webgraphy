import React from 'react';

interface CollapsedMenuButtonProps {
  onClick: () => void;
}

export const CollapsedMenuButton: React.FC<CollapsedMenuButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '0',
        right: '0',
        padding: '12px 24px',
        borderRadius: '0',
        background: 'rgba(255, 255, 255, 0.8)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        borderTop: 'none',
        borderRight: 'none',
        borderBottomLeftRadius: '8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'all 0.2s ease',
        fontWeight: 'bold',
        fontSize: '14px',
        color: '#333',
        minWidth: '80px',
        minHeight: '44px'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 1)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'}
      title="Open Menu"
      aria-label="Open Menu"
    >
      Menu
    </button>
  );
};
