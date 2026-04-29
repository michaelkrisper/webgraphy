import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { THEMES, type ThemeName, COLOR_PALETTE } from '../../themes';
import { Palette } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  themeName: ThemeName;
  ariaLabel?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, themeName, ariaLabel }) => {
  const t = THEMES[themeName];
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
    <div ref={containerRef} style={{ position: 'relative', width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', flexShrink: 0 }}>
      {/* Current Color Indicator / Button */}
      <button
        onClick={toggleOpen}
        title="Select Color"
        aria-label={ariaLabel || "Select Color"}
        style={{
          width: '100%',
          height: '100%',
          padding: 0,
          border: 'none',
          borderRight: `1px solid ${t.border2}`,
          backgroundColor: color,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '2px',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.1)'
        }} />
      </button>

      {/* Popover using Portal */}
      {isOpen && createPortal(
        <div
          id="color-picker-popover"
          style={{
            position: 'absolute',
            top: popoverCoords.top + 4,
            left: popoverCoords.left,
            zIndex: 10001,
            backgroundColor: t.bg,
            border: `1px solid ${t.border}`,
            borderRadius: '4px',
            boxShadow: `0 4px 12px ${t.shadow}`,
            padding: '8px',
            width: '120px'
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
            {COLOR_PALETTE.map((paletteColor) => (
              <button
                key={paletteColor}
                onClick={() => handleSelectTemplate(paletteColor)}
                style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: paletteColor,
                  border: color === paletteColor ? `2px solid ${t.text}` : `1px solid ${t.border}`,
                  borderRadius: '2px',
                  cursor: 'pointer',
                  padding: 0
                }}
                title={paletteColor}
              />
            ))}
          </div>
          <button
            onClick={triggerNativePicker}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '4px',
              fontSize: '0.75rem',
              backgroundColor: t.bg2,
              border: `1px solid ${t.border}`,
              borderRadius: '4px',
              cursor: 'pointer',
              color: t.text
            }}
          >
            <Palette size={12} />
            <span>Custom</span>
          </button>
        </div>,
        document.body
      )}

      {/* Hidden Native Picker */}
      <input
        ref={nativePickerRef}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
          pointerEvents: 'none'
        }}
      />
    </div>
  );
};
