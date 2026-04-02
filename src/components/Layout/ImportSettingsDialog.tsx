import React, { useState, useEffect, useMemo } from 'react';
import { X, Check } from 'lucide-react';
import type { ImportSettings, ColumnConfig, ColumnType } from '../../types/import';

interface ImportSettingsDialogProps {
  fileName: string;
  fileContent: string; // Preview content
  fileType: 'csv' | 'json';
  onConfirm: (settings: ImportSettings) => void;
  onCancel: () => void;
}

export const ImportSettingsDialog: React.FC<ImportSettingsDialogProps> = ({
  fileName,
  fileContent,
  fileType,
  onConfirm,
  onCancel
}) => {
  const [delimiter, setDelimiter] = useState<string>(',');
  const [decimalPoint, setDecimalPoint] = useState<string>('.');
  const [startRow, setStartRow] = useState<number>(1);
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([]);

  // Auto-detect delimiter on mount
  useEffect(() => {
    if (fileType === 'csv') {
      const firstLine = fileContent.split('\n')[0];
      const delimiters = [',', ';', '\t', '|'];
      let best = ',';
      let maxCount = -1;
      for (const d of delimiters) {
        const count = firstLine.split(d).length;
        if (count > maxCount) {
          maxCount = count;
          best = d;
        }
      }
      setDelimiter(best);
    }
  }, [fileContent, fileType]);

  const previewData = useMemo(() => {
    if (fileType === 'json') {
      try {
        const parsed = JSON.parse(fileContent);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const headers = Object.keys(rows[0] || {});
        return { headers, rows: rows.slice(0, 10) };
      } catch (e) {
        return { headers: [], rows: [] };
      }
    }

    const lines = fileContent.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1, 11).map(line =>
      line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''))
    );

    return { headers, rows };
  }, [fileContent, fileType, delimiter]);

  // Initialize column configs when previewData headers change
  useEffect(() => {
    if (previewData.headers.length > 0) {
      // Preserve existing manual changes if possible
      const newConfigs: ColumnConfig[] = previewData.headers.map((name, index) => {
        const existing = columnConfigs[index];
        if (existing && existing.name === name) return existing;

        // Try to guess type from first few rows
        let type: ColumnType = 'numeric';
        let dateFormat: string | undefined = undefined;

        const firstVal = fileType === 'json'
          ? previewData.rows.find(row => (row as any)[name])?.[name as any]
          : previewData.rows.find(row => row[index])?.[index];
        if (firstVal) {
          const normalized = firstVal.replace(decimalPoint, '.');
          const asNum = Number(normalized);
          if (isNaN(asNum) || (normalized.split('.').length > 2)) {
            // Check if it looks like a date
            if (firstVal.includes('-') || firstVal.includes('.') || firstVal.includes('/')) {
              type = 'date';
              // Simple heuristic for common formats
              if (firstVal.match(/^\d{4}-\d{2}-\d{2}$/)) dateFormat = 'YYYY-MM-DD';
              else if (firstVal.match(/^\d{2}\.\d{2}\.\d{4}$/)) dateFormat = 'DD.MM.YYYY';
              else if (firstVal.match(/^\d{2}\/\d{2}\/\d{4}$/)) dateFormat = 'DD/MM/YYYY';
            } else {
              type = 'categorical';
            }
          }
        }

        return { index, name, type, dateFormat };
      });
      setColumnConfigs(newConfigs);
    }
  }, [previewData.headers]); // Only re-run if headers (structure) change

  const handleUpdateColumn = (index: number, updates: Partial<ColumnConfig>) => {
    setColumnConfigs(prev => prev.map(c => c.index === index ? { ...c, ...updates } : c));
  };

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
          <h2 style={{ margin: 0 }}>Import Settings: {fileName}</h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Close dialog"><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          {fileType === 'csv' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Delimiter</label>
              <select
                value={delimiter}
                onChange={e => setDelimiter(e.target.value)}
                style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ced4da' }}
              >
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="\t">Tab</option>
                <option value="|">Pipe (|)</option>
              </select>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Decimal Point</label>
            <select
              value={decimalPoint}
              onChange={e => setDecimalPoint(e.target.value)}
              style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ced4da' }}
            >
              <option value=".">Dot (.)</option>
              <option value=",">Comma (,)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Start Row</label>
            <input
              type="number"
              min="1"
              value={startRow}
              onChange={e => setStartRow(parseInt(e.target.value) || 1)}
              style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ced4da' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '20px', overflowX: 'auto' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>Column Configuration & Preview</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#e9ecef' }}>
                {columnConfigs.map((config, i) => (
                  <th key={i} style={{ border: '1px solid #dee2e6', padding: '8px', textAlign: 'left', minWidth: '150px' }}>
                    <input
                      type="text"
                      value={config.name}
                      onChange={e => handleUpdateColumn(i, { name: e.target.value })}
                      style={{ width: '100%', marginBottom: '4px', fontWeight: 'bold', border: '1px solid transparent', background: 'transparent' }}
                    />
                    <select
                      value={config.type}
                      onChange={e => handleUpdateColumn(i, { type: e.target.value as ColumnType })}
                      style={{ width: '100%', fontSize: '11px', marginBottom: '4px' }}
                    >
                      <option value="numeric">Numeric</option>
                      <option value="date">Date/Time</option>
                      <option value="categorical">Categorical</option>
                      <option value="ignore">Ignore</option>
                    </select>
                    {config.type === 'date' && (
                      <input
                        type="text"
                        placeholder="Format (e.g. YYYY-MM-DD)"
                        value={config.dateFormat || ''}
                        onChange={e => handleUpdateColumn(i, { dateFormat: e.target.value })}
                        style={{ width: '100%', fontSize: '11px', padding: '2px' }}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewData.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columnConfigs.map((config, colIndex) => (
                    <td key={colIndex} style={{
                      border: '1px solid #dee2e6',
                      padding: '8px',
                      color: config.type === 'ignore' ? '#adb5bd' : '#212529',
                      backgroundColor: config.type === 'ignore' ? '#f8f9fa' : 'transparent'
                    }}>
                      {fileType === 'json' ? (row as any)[previewData.headers[colIndex]] : row[colIndex]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: 'auto' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #ced4da', background: '#fff', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ delimiter, decimalPoint, startRow, columnConfigs })}
            style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#007bff', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Check size={16} /> Import Data
          </button>
        </div>
      </div>
    </div>
  );
};
