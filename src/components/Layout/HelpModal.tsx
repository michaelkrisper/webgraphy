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
        <li><strong>Shift + Interaction:</strong> Synchronize all X-axes (zoom/pan/keys)</li>
        <li><strong>CTRL + Drag:</strong> Draw a zoom selection box</li>
        <li><strong>CTRL + C:</strong> Copy current tooltip data to clipboard</li>
        <li><strong>Hover:</strong> Show tooltips for nearest data points (decimal-aligned)</li>
        <li><strong>Double Click:</strong> Auto-scale to fit all data</li>
        <li><strong>Drag & Drop file:</strong> Drop a CSV/JSON onto the chart to import</li>
      </Section>

      <Section title="Axes (X & Y)">
        <li><strong>Mouse Wheel:</strong> Zoom only this axis</li>
        <li><strong>Drag:</strong> Pan only this axis</li>
        <li><strong>Double Click:</strong> Auto-scale this axis</li>
        <li><strong>CTRL + Dbl Click (Y):</strong> Auto-scale to top or bottom half</li>
        <li><strong>Click on title:</strong> Rename the axis</li>
      </Section>

      <Section title="Keyboard">
        <li><strong>← →:</strong> Pan X axis (animated)</li>
        <li><strong>↑ ↓:</strong> Pan Y axis (hovered axis, or all)</li>
        <li><strong>+ / =:</strong> Zoom in (X and Y)</li>
        <li><strong>- / _:</strong> Zoom out (X and Y)</li>
        <li><strong>Shift + ← →:</strong> Pan all X-axes together</li>
        <li><strong>CTRL + + / -:</strong> Zoom only X axis</li>
      </Section>

      <Section title="Sidebar — Data">
        <li><strong>Import:</strong> Load CSV or JSON files (large files handled in a worker)</li>
        <li><strong>Skipped Rows Preview:</strong> Inspect rows skipped during import</li>
        <li><strong>Calculated Columns:</strong> Add, edit, or delete formula columns; reference other columns via <code>[Column Name]</code>. Supports math, <code>avgN</code>, <code>avgTime</code>, <code>avgGroup</code>, <code>avgDay</code>, Kalman <code>filter</code></li>
        <li><strong>X-Axis per Dataset:</strong> Cycle the dataset's X-axis (1–9) and toggle numeric/time mode</li>
      </Section>

      <Section title="Sidebar — Series">
        <li><strong>Drag to Reorder:</strong> Grab a series row to reorder draw/legend order</li>
        <li><strong>Multiple Y-Axes:</strong> Up to 9 Y-axes, each with independent scale, position (L/R), and color</li>
        <li><strong>Style:</strong> Line style (solid/dashed/dotted), point markers (circle/square/cross), color</li>
        <li><strong>Regression:</strong> Add linear, polynomial, exponential, log, or KDE fits</li>
        <li><strong>Visibility:</strong> Toggle per-series visibility; hover row to highlight on chart</li>
      </Section>

      <Section title="Session & Export">
        <li><strong>Save Session:</strong> Export full app state (datasets, axes, series, views) as JSON</li>
        <li><strong>Load Session:</strong> Restore a saved session file</li>
        <li><strong>Export Chart:</strong> Save current view as SVG or PNG</li>
        <li><strong>Auto-Save:</strong> State persists to IndexedDB/localStorage between visits</li>
      </Section>

      <Section title="UI">
        <li><strong>Themes:</strong> Light, Dark, Matrix, Unicorn — cycle via the theme button</li>
        <li><strong>Sidebar Collapse:</strong> Click the logo to collapse/expand the sidebar</li>
        <li><strong>Legend:</strong> Toggle the top-right legend overlay</li>
        <li><strong>Views:</strong> Save and restore zoom/pan snapshots</li>
      </Section>
    </Modal>
  );
};
