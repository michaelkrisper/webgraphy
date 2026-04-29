import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COLOR_PALETTE } from '../../themes';
import { Palette } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  ariaLabel?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, ariaLabel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Check if the click was inside the portal-ed popover
        const popover = document.getElementById('color-picker-popover');
        if (popover && popover.contains(event.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleOpen = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPopoverCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
    setIsOpen(!isOpen);
  };

  const handleSelectTemplate = (selectedColor: string) => {
    onChange(selectedColor);
    setIsOpen(false);
  };

  const triggerNativePicker = () => {
    nativePickerRef.current?.click();
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="color-picker-wrapper">
      <button
        onClick={toggleOpen}
        title="Select Color"
        aria-label={ariaLabel || "Select Color"}
        className="color-picker-btn"
        style={{ backgroundColor: color }}
      >
        <div className="color-picker-swatch" />
      </button>

      {isOpen && createPortal(
        <div
          id="color-picker-popover"
          className="color-picker-popover"
          style={{ top: popoverCoords.top + 4, left: popoverCoords.left }}
        >
          <div className="color-picker-grid">
            {COLOR_PALETTE.map((paletteColor) => (
              <button
                key={paletteColor}
                onClick={() => handleSelectTemplate(paletteColor)}
                className="color-picker-palette-btn"
                style={{
                  backgroundColor: paletteColor,
                  border: color === paletteColor ? `2px solid var(--text-color)` : `1px solid var(--border-color)`
                }}
                title={paletteColor}
              />
            ))}
          </div>
          <button onClick={triggerNativePicker} className="color-picker-custom-btn">
            <Palette size={12} />
            <span>Custom</span>
          </button>
        </div>,
        document.body
      )}

      <input
        ref={nativePickerRef}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="color-picker-native-input"
      />
    </div>
  );
};
