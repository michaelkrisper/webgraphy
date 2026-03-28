import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { useDataImport } from '../../hooks/useDataImport';
import { SeriesConfigUI } from '../Sidebar/SeriesConfig';
import { persistence } from '../../services/persistence';
import { FilePlus, Layout, Trash2, ChevronLeft, ChevronRight, Clock, Hash } from 'lucide-react';

import { exportToSVG, exportToPNG, downloadFile } from '../../services/export';

const COLOR_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', 
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec6e7', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94'
];

/**
 * Sidebar Component
 * Manages data imports, dataset listing, global X-axis settings, and series configuration.
 */
export const Sidebar: React.FC = () => {
  const { datasets, series, yAxes, axisTitles, removeDataset, viewportX, globalXColumn, setGlobalXColumn, xMode, setXMode } = useGraphStore();
  const { importFile, isImporting } = useDataImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allColumns = useMemo(() => {
    const cols = new Set<string>();
    datasets.forEach(d => d.columns.forEach(c => cols.add(c)));
    return Array.from(cols);
  }, [datasets]);

  const [width, setWidth] = useState(450);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Smoothly delay unmounting contents when collapsing
  const [renderContent, setRenderContent] = useState(!isCollapsed);

  useEffect(() => {
    if (!isCollapsed) {
      setRenderContent(true);
    } else {
      const timer = setTimeout(() => setRenderContent(false), 200); // Wait for transition
      return () => clearTimeout(timer);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleExportSVG = () => {
    const plotContainer = document.querySelector('.plot-area') as HTMLElement;
    if (!plotContainer) return;
    
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

    const color = COLOR_PALETTE[series.length % COLOR_PALETTE.length];
    const { addSeries } = useGraphStore.getState();
    
    addSeries({
      id: crypto.randomUUID(),
      sourceId: datasetId,
      name: columnName,
      xColumn: globalXColumn || dataset.columns[0],
      yColumn: columnName,
      yAxisId: 'axis-1',
      pointStyle: 'circle',
      pointColor: color,
      lineStyle: 'solid',
      lineColor: color
    });
  };

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      <aside 
        className="sidebar" 
        style={{ 
          width: isCollapsed ? '40px' : `${width}px`, 
          transition: isResizing ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
          paddingRight: isCollapsed ? '0px' : '15px',
          padding: isCollapsed ? '10px 0' : '1rem'
        }}
      >
        <div className={`sidebar-collapsed-content ${!renderContent && isCollapsed ? 'visible' : ''}`} style={{ transition: 'opacity 0.2s', opacity: (!renderContent && isCollapsed) ? 1 : 0 }}>
          <button onClick={() => setIsCollapsed(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}>
            <ChevronLeft size={20} />
          </button>
          <div style={{ writingMode: 'vertical-rl', marginTop: '20px', fontWeight: 'bold', color: '#666', fontSize: '14px' }}>WebGraphy</div>
        </div>

        <div className={`sidebar-content ${isCollapsed ? 'hidden' : ''}`} style={{ transition: 'opacity 0.2s', opacity: isCollapsed ? 0 : 1, display: renderContent ? 'flex' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #212529', paddingBottom: '0.5rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>WebGraphy</h2>
            <button onClick={() => setIsCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={18} />
            </button>
          </div>
          
          <div className="section">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <FilePlus size={14} style={{ marginRight: '5px' }} />
                Data Sources
              </div>
              <button 
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '2px 8px', cursor: 'pointer', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}
              >
                {isImporting ? '...' : 'Import'}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={async (e) => {
                   if (e.target.files?.[0]) {
                     importFile(e.target.files[0]);
                   }
                }} 
                style={{ display: 'none' }} 
                accept=".csv,.json"
              />
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
            </div>
          </div>

          <div className="section">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Layout size={14} style={{ marginRight: '5px' }} />
                Data Series
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '10px', color: '#666' }}>Global X:</span>
                <select 
                  value={globalXColumn} 
                  onChange={(e) => setGlobalXColumn(e.target.value)}
                  style={{ fontSize: '10px', padding: '1px', border: '1px solid #ced4da', borderRadius: '3px', width: '80px' }}
                >
                  {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  onClick={() => setXMode(xMode === 'date' ? 'numeric' : 'date')}
                  style={{ padding: '2px', cursor: 'pointer', background: '#f8f9fa', border: '1px solid #ced4da', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title={`X-Mode: ${xMode === 'date' ? 'Date/Time' : 'Numeric'}`}
                >
                  {xMode === 'date' ? <Clock size={12} /> : <Hash size={12} />}
                </button>
              </div>
            </div>
            <div className="series-list">
              {series.length === 0 && <p style={{ fontSize: '0.8rem', color: '#666' }}>Click a column above to add a series.</p>}
              {series.map(s => {
                const dataset = datasets.find(d => d.id === s.sourceId);
                return (
                  <SeriesConfigUI 
                    key={s.id} 
                    series={s} 
                    dataset={dataset}
                  />
                );
              })}
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
        </div>
      </aside>
      
      {/* Resizer overlay hidden when collapsed */}
      {!isCollapsed && (
        <div 
          onMouseDown={() => setIsResizing(true)}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '5px',
            cursor: 'col-resize',
            background: isResizing ? '#007bff' : 'transparent',
            zIndex: 10,
            transition: 'background 0.2s'
          }}
        />
      )}
    </div>
  );
};
