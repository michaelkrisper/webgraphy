import React from 'react';
import { FileImage } from 'lucide-react';
import { type Theme } from '../../themes';

interface CollapsedMenuButtonProps {
  onClick: () => void;
  onExportSVG: () => void;
  theme: Theme;
}

export const CollapsedMenuButton: React.FC<CollapsedMenuButtonProps> = ({ onClick, onExportSVG }) => (
  <div className="collapsed-menu-btns">
    <button onClick={onClick} className="collapsed-menu-btn" title="Open Menu" aria-label="Open Menu">
      <img src="./favicon.svg" alt="webgraphy logo" />
    </button>
    <button onClick={onExportSVG} className="collapsed-menu-btn" title="Export SVG" aria-label="Export SVG">
      <FileImage size={18} />
    </button>
  </div>
);
