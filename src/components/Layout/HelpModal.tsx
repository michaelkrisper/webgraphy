import React from 'react';
import { X } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode; first?: boolean }> = ({ title, children, first }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0 24px', marginBottom: '20px' }}>
    {!first && <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #ddd', margin: '0 20px 16px' }} />}
    <div style={{ fontSize: '1em', fontWeight: 600, color: '#111', paddingTop: '2px' }}>{title}</div>
    <ul style={{ margin: 0, paddingLeft: '18px', color: '#444', lineHeight: '1.6' }}>
      {children}
    </ul>
  </div>
);

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
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
        padding: '30px',
        borderRadius: '8px',
        maxWidth: '720px',
        width: '90%',
        position: 'relative',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <button
          onClick={onClose}
          aria-label="Close Help"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={20} />
        </button>

        <h2 style={{ marginTop: 0, marginBottom: '24px', color: '#333' }}>Help & Interactions</h2>

        <Section title="Plot Area" first>
          <li><strong>Mouse Wheel:</strong> Zoom in and out</li>
          <li><strong>Click & Drag:</strong> Pan the chart (move the visible area)</li>
          <li><strong>CTRL + Drag:</strong> Draw a zoom selection box</li>
          <li><strong>Hover:</strong> Show tooltips for the nearest data points</li>
          <li><strong>Double Click:</strong> Auto-scale to fit all data</li>
        </Section>

        <Section title="Axes (X & Y)">
          <li><strong>Mouse Wheel:</strong> Zoom only this specific axis</li>
          <li><strong>Drag:</strong> Pan this specific axis</li>
          <li><strong>Double Click:</strong> Auto-scale this specific axis</li>
          <li><strong>CTRL + Dbl Click (Y):</strong> Auto-scale to top or bottom half of data</li>
          <li><strong>Click on title:</strong> Rename the axis</li>
        </Section>

        <Section title="Keyboard">
          <li><strong>← →:</strong> Pan the X axis</li>
          <li><strong>↑ ↓:</strong> Pan the Y axis (hovered axis, or all)</li>
          <li><strong>+ / =:</strong> Zoom in on the X axis</li>
          <li><strong>- / _:</strong> Zoom out on the X axis</li>
          <li><strong>CTRL + + / -:</strong> Zoom the Y axis (while hovering an axis)</li>
        </Section>

        <Section title="Sidebar">
          <li><strong>Data Sources:</strong> Import large CSV or JSON files — parsed with LTTB downsampling for high performance</li>
          <li><strong>Data Series:</strong> Map columns to X/Y axes and style lines/points</li>
          <li><strong>Multiple Y-Axes:</strong> Each series can have an independent Y-axis with its own scale, position, and color</li>
          <li><strong>Export:</strong> Save the current chart view as SVG or PNG</li>
        </Section>
      </div>
    </div>
  );
};
