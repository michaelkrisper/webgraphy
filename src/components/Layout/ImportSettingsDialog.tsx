import React, { useState, useMemo } from 'react';
import { X, Check } from 'lucide-react';
import type { ImportSettings, ColumnConfig, ColumnType } from '../../types/import';

interface ImportSettingsDialogProps {
  fileName: string;
  fileContent: string; // Preview content
  fileType: 'csv' | 'json';
  onConfirm: (settings: ImportSettings) => void;
  onCancel: () => void;
}

function detectDelimiter(fileContent: string, fileType: 'csv' | 'json'): string {
  if (fileType !== 'csv') return ',';
  const firstLine = fileContent.split('\n')[0];
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let maxCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length;
    if (count > maxCount) { maxCount = count; best = d; }
  }
  return best;
}

export const ImportSettingsDialog: React.FC<ImportSettingsDialogProps> = ({
  fileName,
  fileContent,
  fileType,
  onConfirm,
  onCancel
}) => {
  const [delimiter, setDelimiter] = useState<string>(() => detectDelimiter(fileContent, fileType));
  const [decimalPoint, setDecimalPoint] = useState<string>('.');
  const [startRow, setStartRow] = useState<number>(1);
  // Stores per-column user overrides, keyed by column name
  const [columnOverrides, setColumnOverrides] = useState<Record<string, Partial<ColumnConfig>>>({});
  // null = auto-select best X axis column
  const [xAxisColumnOverride, setXAxisColumnOverride] = useState<string | null>(null);

  const previewData = useMemo(() => {
    if (fileType === 'json') {
      try {
        const parsed = JSON.parse(fileContent) as unknown;
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const headers = Object.keys((rows[0] as Record<string, unknown>) || {});
        return { headers, rows: (rows as Record<string, string>[]).slice(0, 10) };
      } catch {
        return { headers: [], rows: [] as Record<string, string>[] };
      }
    }

    const lines = fileContent.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] as string[][] };

    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1, 11).map(line =>
      line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''))
    );
    return { headers, rows };
  }, [fileContent, fileType, delimiter]);

  // Derived column configs: auto-detected type + user overrides (keyed by column name)
  const columnConfigs = useMemo<ColumnConfig[]>(() => {
    return previewData.headers.map((name, index) => {
      const override = columnOverrides[name];
      if (override) return { index, name, type: 'numeric' as ColumnType, ...override };

      let type: ColumnType = 'numeric';
      let dateFormat: string | undefined;

      const firstVal = fileType === 'json'
        ? (previewData.rows as Record<string, string>[]).find(row => row[name])?.[name]
        : (previewData.rows as string[][])[0]?.[index];

      if (firstVal) {
        const normalized = firstVal.replace(decimalPoint, '.');
        if (isNaN(Number(normalized)) || normalized.split('.').length > 2) {
          if (firstVal.includes('-') || firstVal.includes('.') || firstVal.includes('/')) {
            type = 'date';
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
  }, [previewData, columnOverrides, decimalPoint, fileType]);

  // Derived X axis column: user override if still valid, otherwise auto-select date col or first col
  const xAxisColumn = useMemo(() => {
    const nonIgnored = columnConfigs.filter(c => c.type !== 'ignore');
    if (xAxisColumnOverride && nonIgnored.find(c => c.name === xAxisColumnOverride)) {
      return xAxisColumnOverride;
    }
    return nonIgnored.find(c => c.type === 'date')?.name || nonIgnored[0]?.name || '';
  }, [columnConfigs, xAxisColumnOverride]);

  const handleUpdateColumn = (index: number, updates: Partial<ColumnConfig>) => {
    const name = columnConfigs[index].name;
    setColumnOverrides(prev => ({ ...prev, [name]: { ...prev[name], ...updates } }));
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        backgroundColor: '#fff', padding: '16px', borderRadius: '8px',
        maxWidth: '1000px', width: '95%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Import Settings: {fileName}</h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Close dialog"><X size={24} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          {fileType === 'csv' && (
            <div>
              <label htmlFor="import-delimiter" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px' }}>Delimiter</label>
              <select
                id="import-delimiter"
                value={delimiter}
                onChange={e => setDelimiter(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ced4da', height: '40px', fontSize: '14px' }}
              >
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="\t">Tab</option>
                <option value="|">Pipe (|)</option>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="import-decimal" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px' }}>Decimal Point</label>
            <select
              id="import-decimal"
              value={decimalPoint}
              onChange={e => setDecimalPoint(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ced4da', height: '40px', fontSize: '14px' }}
            >
              <option value=".">Dot (.)</option>
              <option value=",">Comma (,)</option>
            </select>
          </div>
          <div>
            <label htmlFor="import-start-row" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px' }}>Start Row</label>
            <input
              id="import-start-row"
              type="number"
              min="1"
              value={startRow}
              onChange={e => setStartRow(parseInt(e.target.value) || 1)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ced4da', height: '40px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label htmlFor="import-x-axis" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px' }}>X-Axis Column</label>
            <select
              id="import-x-axis"
              value={xAxisColumn}
              onChange={e => setXAxisColumnOverride(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ced4da', height: '40px', fontSize: '14px' }}
            >
              {columnConfigs.filter(c => c.type !== 'ignore').map(c => (
                <option key={c.index} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '20px', overflowX: 'auto' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '10px' }}>Column Configuration & Preview</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#e9ecef' }}>
                {columnConfigs.map((config, i) => (
                  <th key={i} style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'left', minWidth: '180px' }}>
                    <input
                      type="text"
                      maxLength={100}
                      value={config.name}
                      aria-label={`Column ${i + 1} name`}
                      onChange={e => handleUpdateColumn(i, { name: e.target.value })}
                      style={{ width: '100%', marginBottom: '8px', fontWeight: 'bold', border: '1px solid #dee2e6', background: '#fff', padding: '4px', fontSize: '14px', borderRadius: '4px' }}
                    />
                    <select
                      value={config.type}
                      aria-label={`Column ${i + 1} data type`}
                      onChange={e => handleUpdateColumn(i, { type: e.target.value as ColumnType })}
                      style={{ width: '100%', fontSize: '14px', marginBottom: '8px', height: '36px', borderRadius: '4px' }}
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
                        maxLength={50}
                        aria-label={`Column ${i + 1} date format`}
                        value={config.dateFormat || ''}
                        onChange={e => handleUpdateColumn(i, { dateFormat: e.target.value })}
                        style={{ width: '100%', fontSize: '14px', padding: '6px', border: '1px solid #dee2e6', borderRadius: '4px' }}
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
                      padding: '12px',
                      color: config.type === 'ignore' ? '#adb5bd' : '#212529',
                      backgroundColor: config.type === 'ignore' ? '#f8f9fa' : 'transparent'
                    }}>
                      {fileType === 'json'
                        ? (row as Record<string, string>)[previewData.headers[colIndex]]
                        : (row as string[])[colIndex]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: 'auto', flexWrap: 'wrap' }}>
          <button
            onClick={onCancel}
            style={{ padding: '12px 24px', borderRadius: '4px', border: '1px solid #ced4da', background: '#fff', cursor: 'pointer', minHeight: '44px', fontSize: '1rem', flex: '1 1 auto' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ delimiter, decimalPoint, startRow, columnConfigs, xAxisColumn })}
            style={{ padding: '12px 24px', borderRadius: '4px', border: 'none', background: '#007bff', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '44px', fontSize: '1rem', flex: '1 1 auto', fontWeight: 'bold' }}
          >
            <Check size={20} /> Import Data
          </button>
        </div>
      </div>
    </div>
  );
};
