import React from 'react';
import { type Theme } from '../../themes';

interface CollapsedMenuButtonProps {
  onClick: () => void;
  theme: Theme;
}

export const CollapsedMenuButton: React.FC<CollapsedMenuButtonProps> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="collapsed-menu-btn"
    title="Open Menu"
    aria-label="Open Menu"
  >
    <img src="./favicon.svg" alt="webgraphy logo" />
  </button>
);
