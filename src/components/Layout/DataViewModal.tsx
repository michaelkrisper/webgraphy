import React from 'react';
import { type Dataset } from '../../services/persistence';
import { formatFullDate } from '../../utils/time';
import { Modal } from './Modal';
import { type Theme } from '../../themes';

interface DataViewModalProps {
  dataset: Dataset;
  onClose: () => void;
  theme: Theme;
}

/**
 * DataViewModal Component
 * Displays a table of the dataset's values (up to 100 rows).
 */
export const DataViewModal: React.FC<DataViewModalProps> = ({ dataset, onClose, theme: t }) => {
  const maxRows = Math.min(dataset.rowCount, 100);
  const rows = Array.from({ length: maxRows }, (_, i) => i);
  const displayName = dataset.name.includes(': ') ? dataset.name.split(': ')[1] : dataset.name;

  return (
    <Modal
      onClose={onClose}
      title={`Data Source: ${displayName}`}
      maxWidth="1000px"
      width="95%"
      padding="16px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 24px', borderRadius: '4px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, cursor: 'pointer', fontWeight: 'bold', minHeight: '36px', fontSize: '0.9rem' }}
          >
            Close
          </button>
        </div>
      }
    >
      <div style={{ marginBottom: '12px', fontSize: '0.9rem', color: t.textMuted }}>
        Showing first {maxRows} of {dataset.rowCount.toLocaleString()} rows.
      </div>

      <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: '4px', backgroundColor: t.bg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ backgroundColor: t.bg2, borderBottom: `2px solid ${t.border}` }}>
              {(dataset.columns || []).map((col, i) => (
                <th key={i} style={{ border: `1px solid ${t.border}`, padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap', color: t.textMid }}>
                  {col.includes(': ') ? col.split(': ')[1] : col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(rowIndex => (
              <tr key={rowIndex} style={{ borderBottom: `1px solid ${t.border}`, backgroundColor: rowIndex % 2 === 0 ? t.bg : t.bg2 }}>
                {(dataset.data || []).map((colData, colIndex) => {
                  const rawValue = colData.data[rowIndex];
                  const absoluteValue = rawValue + colData.refPoint;

                  let displayValue: string;
                  if (colData.isFloat64 && !isNaN(absoluteValue)) {
                    displayValue = formatFullDate(absoluteValue);
                  } else if (isNaN(absoluteValue)) {
                    displayValue = 'NaN';
                  } else {
                    // Format numbers with up to 4 decimal places
                    displayValue = Number.isInteger(absoluteValue)
                      ? absoluteValue.toString()
                      : absoluteValue.toFixed(4).replace(/\.?0+$/, '');
                  }

                  return (
                    <td key={colIndex} style={{ border: `1px solid ${t.border}`, padding: '4px 8px', color: t.text }}>
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};
