import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COLOR_PALETTE } from '../../themes';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  ariaLabel?: string;
}

// Helper: Hex to RGB
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

// Helper: RGB to Hex
const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (n: number) => {
    const h = Math.max(0, Math.min(255, n)).toString(16);
    return h.length === 1 ? '0' + h : h;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Helper: RGB to HSL
const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s; const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
};

// Helper: HSL to RGB
const hslToRgb = (h: number, s: number, l: number) => {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
};

function ColorPicker({ color, onChange, ariaLabel }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localHex, setLocalHex] = useState(color);
  const [prevColor, setPrevColor] = useState(color);
  const containerRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const brightnessRef = useRef<HTMLDivElement>(null);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0 });

  const hsl = rgbToHsl(hexToRgb(color).r, hexToRgb(color).g, hexToRgb(color).b);
  const [hue, setHue] = useState(hsl.h);

  if (color !== prevColor) {
    setPrevColor(color);
    setLocalHex(color);
    const newHsl = rgbToHsl(hexToRgb(color).r, hexToRgb(color).g, hexToRgb(color).b);
    if (newHsl.s > 1) setHue(newHsl.h);
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        const popover = document.getElementById('color-picker-popover');
        if (popover && popover.contains(event.target as Node)) return;
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleOpen = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPopoverCoords({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
    }
    setIsOpen(!isOpen);
  };

  const handleHueMove = (e: React.MouseEvent | React.TouchEvent | MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
    setHue(h);
    const rgb = hslToRgb(h, 100, hsl.l || 50);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const handleBrightnessMove = (e: React.MouseEvent | React.TouchEvent | MouseEvent) => {
    if (!brightnessRef.current) return;
    const rect = brightnessRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const l = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const rgb = hslToRgb(hue, 100, l);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalHex(val);
    if (/^#[0-9A-F]{6}$/i.test(val)) onChange(val.toLowerCase());
  };

  const rgb = hexToRgb(color);
  const handleRgbChange = (part: 'r' | 'g' | 'b', val: string) => {
    let n = parseInt(val);
    if (isNaN(n)) n = 0;
    const newRgb = { ...rgb, [part]: Math.min(255, n) };
    onChange(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
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
      </button>

      {isOpen && createPortal(
        <div
          id="color-picker-popover"
          className="color-picker-popover"
          style={{ top: popoverCoords.top + 4, left: popoverCoords.left }}
        >
          {/* 1. Template bar */}
          <div className="color-picker-grid">
            {COLOR_PALETTE.map((p) => (
              <button
                key={p}
                onClick={() => { onChange(p); setIsOpen(false); }}
                className="color-picker-palette-btn"
                style={{
                  backgroundColor: p,
                  border: color.toLowerCase() === p.toLowerCase() ? `2px solid var(--text)` : `1px solid var(--border)`
                }}
              />
            ))}
          </div>

          {/* 2. Hue Slider */}
          <div
            ref={hueRef}
            className="color-picker-spectrum-hue"
            onMouseDown={(e) => { handleHueMove(e); const move = (me: MouseEvent) => handleHueMove(me); const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); }}
          >
            <div className="color-picker-hue-cursor" style={{ left: `${(hue / 360) * 100}%` }} />
          </div>

          {/* 3. Lightness Slider (Black - Vivid - White) */}
          <div
            ref={brightnessRef}
            className="color-picker-spectrum-brightness"
            style={{ background: `linear-gradient(to right, #000, hsl(${hue}, 100%, 50%), #fff)` }}
            onMouseDown={(e) => { handleBrightnessMove(e); const move = (me: MouseEvent) => handleBrightnessMove(me); const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); }}
          >
            <div className="color-picker-brightness-cursor" style={{ left: `${hsl.l}%` }} />
          </div>

          {/* 4. Inputs */}
          <div className="color-picker-inputs">
            <div className="color-picker-input-group">
              <span className="color-picker-label">Hex</span>
              <input type="text" value={localHex} onChange={handleHexChange} className="color-picker-input" spellCheck={false} />
            </div>
            <div className="color-picker-input-group">
              <span className="color-picker-label">RGB</span>
              <div className="color-picker-rgb-inputs">
                {(['r', 'g', 'b'] as const).map(p => (
                  <input key={p} type="text" value={rgb[p]} onChange={(e) => handleRgbChange(p, e.target.value)} className="color-picker-input" maxLength={3} />
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ColorPicker;

