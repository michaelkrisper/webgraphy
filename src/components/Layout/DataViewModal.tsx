import React from 'react';
import { type Dataset } from '../../services/persistence';
import { formatFullDate } from '../../utils/time';
import { Modal } from './Modal';

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
  const displayName = dataset.name.includes(': ') ? dataset.name.split(': ')[1] : dataset.name;

  return (
    <Modal
      onClose={onClose}
      title={`Data Source: ${displayName}`}
      maxWidth="100vw"
      width="100vw"
      height="100vh"
      maxHeight="100vh"
      padding="16px"
      borderRadius="0"
      footer={
        <div className="dv-footer">
          <button
            onClick={onClose}
            className="dv-close-btn"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="dv-meta">
        Showing first {maxRows} of {dataset.rowCount.toLocaleString()} rows.
      </div>

      <div className="dv-table-wrap">
        <table className="dv-table">
          <thead className="dv-thead">
            <tr>
              {(dataset.columns || []).map((col, i) => (
                <th key={i} className="dv-th">
                  {col.includes(': ') ? col.split(': ')[1] : col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(rowIndex => (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'dv-tr-even' : 'dv-tr-odd'}>
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
                    <td key={colIndex} className="dv-td">
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
