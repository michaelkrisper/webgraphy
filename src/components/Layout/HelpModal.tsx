import React from 'react';
import { X } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

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
        maxWidth: '550px',
        width: '90%',
        position: 'relative',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <button 
          onClick={onClose}
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

        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Help & Interactions</h2>
        
        <div style={{ lineHeight: '1.6', color: '#444' }}>
          <h3 style={{ fontSize: '1.1em', marginBottom: '10px', color: '#111' }}>Plot Area</h3>
          <ul style={{ paddingLeft: '20px', marginBottom: '20px' }}>
            <li><strong>Mouse Wheel:</strong> Zoom in and out</li>
            <li><strong>Click & Drag:</strong> Pan the chart (move the visible area)</li>
            <li><strong>CTRL + Click & Drag:</strong> Draw a zoom selection box</li>
            <li><strong>Hover:</strong> Show tooltips for the nearest data points</li>
            <li><strong>Double Click:</strong> Auto-scale to fit all data</li>
          </ul>

          <h3 style={{ fontSize: '1.1em', marginBottom: '10px', color: '#111' }}>Axes (X & Y)</h3>
          <ul style={{ paddingLeft: '20px', marginBottom: '20px' }}>
            <li><strong>Mouse Wheel on an axis:</strong> Zoom only this specific axis</li>
            <li><strong>Drag on an axis:</strong> Pan this specific axis</li>
            <li><strong>Double Click:</strong> Auto-scale this specific axis</li>
            <li><strong>CTRL + Double Click (Y-Axis):</strong> Auto-scale focusing on the top or bottom half of the data (depending on click position)</li>
          </ul>

          <h3 style={{ fontSize: '1.1em', marginBottom: '10px', color: '#111' }}>Sidebar Features</h3>
          <ul style={{ paddingLeft: '20px', marginBottom: '20px' }}>
            <li><strong>Data Sources:</strong> Import very large CSV or JSON files. They are parsed and heavily optimized (Level of Detail) for high performance.</li>
            <li><strong>Data Series:</strong> After importing, map any columns to X/Y axes and style lines/points.</li>
            <li><strong>Export:</strong> Save the current chart view as SVG or PNG.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
