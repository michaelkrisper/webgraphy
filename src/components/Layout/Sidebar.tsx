import React, { useRef } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { useDataImport } from '../../hooks/useDataImport';
import { SeriesConfigUI } from '../Sidebar/SeriesConfig';
import { persistence } from '../../services/persistence';
import { FilePlus, Layout, Type, Trash2 } from 'lucide-react';

import { exportToSVG, exportToPNG, downloadFile } from '../../services/export';

export const Sidebar: React.FC = () => {
  const { datasets, series, yAxes, axisTitles, setAxisTitles, addSeries, removeDataset, viewportX } = useGraphStore();
  const { importFile, isImporting } = useDataImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportSVG = () => {
    const plotContainer = document.querySelector('.plot-area') as HTMLElement;
    if (!plotContainer) return;
    
    // We'll use a simplified version for now that captures the current view
    // A full LTTB-optimized SVG export would require more coordinate math
    const svgContent = exportToSVG(datasets, series, {
      xMin: viewportX.min, xMax: viewportX.max,
      yMin: yAxes[0]?.min || 0, yMax: yAxes[0]?.max || 100,
      width: plotContainer.clientWidth, height: plotContainer.clientHeight,
      padding: { top: 20, right: 30, bottom: 50, left: 70 }
    }, axisTitles);
    
    downloadFile(svgContent, 'webgraphy-export.svg', 'image/svg+xml');
  };

  const handleExportPNG = async () => {
    const plotContainer = document.querySelector('.plot-area') as HTMLElement;
    if (!plotContainer) return;
    
    const pngData = await exportToPNG(plotContainer);
    downloadFile(pngData, 'webgraphy-export.png', 'image/png');
  };

  const createSeries = (datasetId: string, columnName: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (!dataset) return;

    addSeries({
      id: crypto.randomUUID(),
      sourceId: datasetId,
      xColumn: dataset.columns[0],
      yColumn: columnName,
      yAxisId: 'default-y',
      pointStyle: 'circle',
      pointColor: '#007bff',
      pointSize: 3,
      lineStyle: 'solid',
      lineColor: '#007bff',
      lineWidth: 1
    });
  };

  return (
    <aside className="sidebar">
      <h2>WebGraphy</h2>
      
      <div className="section">
        <div className="section-title">
          <FilePlus size={14} style={{ marginRight: '5px' }} />
          Data Sources
        </div>
        <div className="sources-list" style={{ marginBottom: '1rem' }}>
          {datasets.map(d => (
            <div key={d.id} style={{ padding: '8px', border: '1px solid #dee2e6', borderRadius: '4px', background: '#fff', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{d.name}</div>
                <button 
                  onClick={async () => {
                    await persistence.deleteDataset(d.id);
                    removeDataset(d.id);
                  }} 
                  style={{ padding: '2px', cursor: 'pointer', background: 'none', border: 'none', color: '#dc3545', display: 'flex' }}
                  title="Remove data source"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '8px' }}>{d.rowCount} rows</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {d.columns.map(col => (
                  <button 
                    key={col} 
                    onClick={() => createSeries(d.id, col)}
                    style={{ fontSize: '10px', padding: '2px 4px', cursor: 'pointer', background: '#e9ecef', border: '1px solid #ced4da', borderRadius: '3px' }}
                  >
                    + {col}
                  </button>
                ))}
              </div>
            </div>
          ))}
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={async (e) => {
               if (e.target.files?.[0]) {
                 // In a real app, useDataImport would trigger the worker
                 // For now, assume importFile handles it and updates the store
                 importFile(e.target.files[0]);
               }
            }} 
            style={{ display: 'none' }} 
            accept=".csv,.json"
          />
          <button 
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', padding: '10px', cursor: 'pointer', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
          >
            {isImporting ? 'Importing...' : 'Import File (CSV/JSON)'}
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <Layout size={14} style={{ marginRight: '5px' }} />
          Data Series
        </div>
        <div className="series-list">
          {series.length === 0 && <p style={{ fontSize: '0.8rem', color: '#666' }}>Click a column above to add a series.</p>}
          {series.map(s => {
            const dataset = datasets.find(d => d.id === s.sourceId);
            return (
              <SeriesConfigUI 
                key={s.id} 
                series={s} 
                datasetName={dataset?.name || 'Unknown'} 
                columns={dataset?.columns || []} 
              />
            );
          })}
        </div>
      </div>

      <div className="section" style={{ marginTop: '1.5rem', borderTop: '1px solid #dee2e6', paddingTop: '1rem' }}>
        <div className="section-title">
          <Type size={14} style={{ marginRight: '5px' }} />
          Axis Settings
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '3px' }}>X-Axis Title</label>
          <input 
            type="text" 
            value={axisTitles.x} 
            onChange={(e) => setAxisTitles(e.target.value, axisTitles.y)}
            style={{ width: '100%', padding: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '3px' }}>Y-Axis Title</label>
          <input 
            type="text" 
            value={axisTitles.y} 
            onChange={(e) => setAxisTitles(axisTitles.x, e.target.value)}
            style={{ width: '100%', padding: '5px' }}
          />
        </div>
      </div>

      <div className="section" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #dee2e6' }}>
        <button 
          onClick={handleExportSVG}
          style={{ width: '100%', marginBottom: '0.5rem', padding: '8px', cursor: 'pointer' }}
        >
          Export SVG
        </button>
        <button 
          onClick={handleExportPNG}
          style={{ width: '100%', padding: '8px', cursor: 'pointer' }}
        >
          Export PNG
        </button>
      </div>
    </aside>
  );
};
