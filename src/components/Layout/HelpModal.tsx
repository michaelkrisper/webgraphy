import React from 'react';
import { Modal } from './Modal';

interface HelpModalProps {
  onClose: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode; first?: boolean }> = ({ title, children, first }) => (
  <div className="help-section">
    {!first && <div className="help-section-divider" />}
    <div className="help-section-title">{title}</div>
    <ul className="help-section-list">
      {children}
    </ul>
  </div>
);

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <Modal
      onClose={onClose}
      title="Help & Interactions"
      maxWidth="720px"
      padding="16px"
      ariaLabel="Close Help"
    >
      <Section title="Plot Area" first>
        <li><strong>Mouse Wheel:</strong> Zoom in and out</li>
        <li><strong>Click & Drag:</strong> Pan the chart</li>
        <li><strong>Shift + Interaction:</strong> Synchronize all active X-axes (Zoom/Pan/Keys)</li>
        <li><strong>CTRL + Drag:</strong> Draw a zoom selection box</li>
        <li><strong>CTRL + C:</strong> Copy current tooltip data to clipboard</li>
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
        <li><strong>Shift + ← →:</strong> Pan all active X-axes together</li>
        <li><strong>CTRL + + / -:</strong> Zoom the Y axis (while hovering an axis)</li>
      </Section>

      <Section title="Sidebar">
        <li><strong>Data Sources:</strong> Import large CSV or JSON files — parsed with LTTB downsampling for high performance</li>
        <li><strong>Data Series:</strong> Map columns to X/Y axes and style lines/points</li>
        <li><strong>Multiple Y-Axes:</strong> Each series can have an independent Y-axis with its own scale, position, and color</li>
        <li><strong>Export:</strong> Save the current chart view as SVG or PNG</li>
      </Section>
    </Modal>
  );
};
