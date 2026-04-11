import React, { useState } from 'react';
import { X, Check, Calculator, AlertCircle } from 'lucide-react';
import { useGraphStore } from '../../store/useGraphStore';
import { type Dataset } from '../../services/persistence';

interface CalculatedColumnModalProps {
  dataset: Dataset;
  onClose: () => void;
}

export const CalculatedColumnModal: React.FC<CalculatedColumnModalProps> = ({ dataset, onClose }) => {
  const { addCalculatedColumn } = useGraphStore();
  const [name, setName] = useState('New Series');
  const [formula, setFormula] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter a column name.');
      return;
    }

    if (!formula.trim()) {
      setError('Please enter a formula.');
      return;
    }

    const result = addCalculatedColumn(dataset.id, name.trim(), formula.trim());
    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Failed to create calculated column.');
    }
  };

  const insertColumn = (colName: string) => {
    // Strip prefix for formula readability if it matches the current dataset pattern
    const displayName = colName.includes(': ') ? colName.split(': ')[1] : colName;
    setFormula(prev => prev + `[${displayName}]`);
  };

  const insertOperator = (op: string) => {
    setFormula(prev => prev + op);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        backgroundColor: '#fff', padding: '20px', borderRadius: '8px',
        maxWidth: '500px', width: '95%', boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={20} color="#3b82f6" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Add Calculated Series</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="col-name" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px' }}>Column Name</label>
            <input
              id="col-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Adjusted Temperature"
              maxLength={50}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ced4da', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="formula" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px' }}>Formula</label>
            <textarea
              id="formula"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="e.g. [Temperature] * -1 + 273.15"
              style={{ width: '100%', height: '80px', padding: '8px', borderRadius: '4px', border: '1px solid #ced4da', fontSize: '14px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '6px' }}>Available Columns (click to insert)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '100px', overflowY: 'auto', padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
              {dataset.columns.map(col => (
                <button
                  key={col}
                  type="button"
                  onClick={() => insertColumn(col)}
                  style={{ fontSize: '11px', padding: '4px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                >
                  {col.includes(': ') ? col.split(': ')[1] : col}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '6px' }}>Shortcuts</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {['+', '-', '*', '/', '^', '(', ')', 'log(', 'pi', 'e'].map(op => (
                <button
                  key={op}
                  type="button"
                  onClick={() => insertOperator(op)}
                  style={{ fontSize: '12px', padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  {op}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '14px', marginBottom: '16px', padding: '8px', background: '#fef2f2', borderRadius: '4px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #ced4da', background: '#fff', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
            >
              <Check size={18} /> Create Series
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
