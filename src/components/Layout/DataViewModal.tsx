import React from 'react';
import { X } from 'lucide-react';
import { type Dataset } from '../../services/persistence';
import { formatFullDate } from '../../utils/time';

interface DataViewModalProps {
  dataset: Dataset;
  onClose: () => void;
}

/**
 * DataViewModal Component
 * Displays a table of the dataset's values (up to 100 rows).
 */
export const DataViewModal: React.FC<DataViewModalProps> = ({ dataset, onClose }) => {
  const maxRows = Math.min(dataset.rowCount, 100);
  const rows = Array.from({ length: maxRows }, (_, i) => i);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        backgroundColor: '#fff', padding: '24px', borderRadius: '8px',
        maxWidth: '1000px', width: '95%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Data Source: {dataset.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
          Showing first {maxRows} of {dataset.rowCount.toLocaleString()} rows.
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #dee2e6', borderRadius: '4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                {dataset.columns.map((col, i) => (
                  <th key={i} style={{ border: '1px solid #dee2e6', padding: '8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(rowIndex => (
                <tr key={rowIndex} style={{ borderBottom: '1px solid #eee' }}>
                  {dataset.data.map((colData, colIndex) => {
                    const rawValue = colData.levels[0][rowIndex];
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
                      <td key={colIndex} style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 24px', borderRadius: '4px', border: '1px solid #ced4da', background: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
