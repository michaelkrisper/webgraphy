import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { useDataImport } from '../../hooks/useDataImport';
import { SeriesConfigUI } from '../Sidebar/SeriesConfig';
import { persistence } from '../../services/persistence';
import { FilePlus, Layout, Trash2, ChevronRight, Clock, Hash, HelpCircle, X, Eye, FileImage, Image, RotateCcw } from 'lucide-react';
import { ImportSettingsDialog } from './ImportSettingsDialog';

import { exportToSVG, exportToPNG, downloadFile } from '../../services/export';
import { ImprintModal } from './ImprintModal';
import { HelpModal } from './HelpModal';
import { LicenseModal } from './LicenseModal';

const COLOR_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', 
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec6e7', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94'
];

/**
 * Sidebar Component (v2.6 - Floating Expand Button)
 * Manages data imports, dataset listing, global X-axis settings, and series configuration.
 */
export const Sidebar: React.FC = () => {
  const { datasets, series, yAxes, axisTitles, removeDataset, viewportX, globalXColumn, setGlobalXColumn, xMode, setXMode, views, saveView, applyView, deleteView, moveSeries, updateViewName } = useGraphStore();
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [tempViewName, setTempViewName] = useState('');
  const [showImprint, setShowImprint] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allColumns = useMemo(() => {
    const cols = new Set<string>();
    datasets.forEach(d => d.columns.forEach(c => cols.add(c)));
    return Array.from(cols);
  }, [datasets]);

  const [width, setWidth] = useState(450);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [openSections, setOpenSections] = useState({ sources: true, series: true, views: true });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections(s => ({ ...s, [key]: !s[key] }));
  const { importFile, confirmImport, cancelImport, pendingFile, isImporting } = useDataImport();
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const customViews = useMemo(() => {
    return views ? views.filter(v => v.id !== 'default-view') : [];
  }, [views]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(600, window.innerWidth - e.clientX));
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

    const svgContent = exportToSVG(
      datasets, 
      series, 
      yAxes,
      { min: viewportX.min, max: viewportX.max },
      axisTitles,
      xMode,
      plotContainer.clientWidth, 
      plotContainer.clientHeight
    );

    downloadFile(svgContent, 'webgraphy-export.svg', 'image/svg+xml');
  };

  const handleExportPNG = async () => {
    const plotContainer = document.querySelector('.plot-area') as HTMLElement;
    if (!plotContainer) return;

    const pngData = await exportToPNG(
      datasets, 
      series, 
      yAxes,
      { min: viewportX.min, max: viewportX.max },
      axisTitles,
      xMode,
      plotContainer.clientWidth, 
      plotContainer.clientHeight
    );
    downloadFile(pngData, 'webgraphy-export.png', 'image/png');
  };

  const createSeries = (datasetId: string, columnName: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (!dataset) return;

    const { addSeries } = useGraphStore.getState();
    
    // Find the first Y-axis that is not currently used by any series
    const usedAxisIds = new Set(series.map(s => s.yAxisId));
    let nextAxisId = 'axis-1';
    for (let i = 1; i <= 9; i++) {
      const id = `axis-${i}`;
      if (!usedAxisIds.has(id)) {
        nextAxisId = id;
        break;
      }
    }
    
    // If all axes are already in use, fall back to a simple cycle
    if (usedAxisIds.size >= 9) {
      nextAxisId = `axis-${(series.length % 9) + 1}`;
    }

    const color = COLOR_PALETTE[series.length % COLOR_PALETTE.length];
    
    addSeries({
      id: crypto.randomUUID(),
      sourceId: datasetId,
      name: columnName,
      xColumn: globalXColumn || dataset.columns[0],
      yColumn: columnName,
      yAxisId: nextAxisId,
      pointStyle: 'circle',
      pointColor: color,
      lineStyle: 'solid',
      lineColor: color
    });
  };

  return (
    <>
      {isCollapsed && (
        <button 
          onClick={() => setIsCollapsed(false)}
          style={{
            position: 'absolute',
            top: '0',
            right: '0',
            padding: '8px 16px',
            borderRadius: '0',
            background: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderTop: 'none',
            borderRight: 'none',
            borderBottomLeftRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease',
            fontWeight: 'bold',
            fontSize: '12px',
            color: '#333'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'}
          title="Open Menu"
        >
          Menu
        </button>
      )}

      <aside 
        className="sidebar" 
        style={{ 
          width: isCollapsed ? '0px' : `${width}px`, 
          borderLeft: isCollapsed ? 'none' : '1px solid var(--border-color)',
          padding: isCollapsed ? '0px' : '1rem',
          position: 'relative',
          overflow: isCollapsed ? 'hidden' : 'auto'
        }}
      >
        <div className={`sidebar-content ${isCollapsed ? 'hidden' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #212529', paddingBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="./favicon.svg" alt="logo" style={{ width: '24px', height: '24px', borderRadius: '4px' }} />
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>WebGraphy</h2>
              <button 
                onClick={() => setShowHelp(true)}
                title="Help & Interactions"
                aria-label="Help & Interactions"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#007bff' }}
              >
                <HelpCircle size={18} />
              </button>
            </div>
            <button onClick={() => setIsCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} aria-label="Collapse Menu">
              <ChevronRight size={18} />
            </button>
          </div>
          
          <div className="section">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
              <div onClick={() => toggleSection('sources')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}>
                <ChevronRight size={14} style={{ marginRight: '4px', transition: 'transform 0.15s', transform: openSections.sources ? 'rotate(90deg)' : 'none' }} />
                <FilePlus size={14} style={{ marginRight: '5px' }} />
                Data Sources
              </div>
              <button
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '4px 12px', cursor: 'pointer', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px' }}
              >
                {isImporting ? '...' : 'Import'}
              </button>
              <input
                type="file"
                name="file-import"
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
            {openSections.sources && <div className="sources-list" style={{ marginBottom: '1rem' }}>
              {datasets.map(d => (
                <div key={d.id} style={{ padding: '8px', border: '1px solid #dee2e6', borderRadius: '4px', background: '#fff', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }} title={d.name}>{d.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>{d.rowCount.toLocaleString()} rows</div>
                      <button 
                        onClick={async () => {
                          await persistence.deleteDataset(d.id);
                          removeDataset(d.id);
                        }} 
                        style={{ padding: '2px', cursor: 'pointer', background: 'none', border: 'none', color: '#dc3545', display: 'flex' }}
                        title="Remove data source"
                        aria-label="Remove data source"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <details>
                    <summary style={{ fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none', marginBottom: '8px', color: '#495057', display: 'flex', alignItems: 'center' }}>
                      <ChevronRight size={14} className="details-chevron" />
                      <span style={{ flex: 1 }}>Columns ({d.columns.length})</span>
                    </summary>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                      <input
                        type="text"
                        name={`column-filter-${d.id}`}
                        autoComplete="off"
                        placeholder="Filter..."
                        value={columnFilters[d.id] || ''}
                        onChange={(e) => setColumnFilters({ ...columnFilters, [d.id]: e.target.value })}
                        style={{ width: '100%', padding: '4px 22px 4px 6px', fontSize: '12px', border: '1px solid #ced4da', borderRadius: '3px', boxSizing: 'border-box', outline: 'none' }}
                      />
                      {columnFilters[d.id] && (
                        <X
                          size={14}
                          style={{ position: 'absolute', right: '6px', cursor: 'pointer', color: '#999' }}
                          onClick={() => setColumnFilters({ ...columnFilters, [d.id]: '' })}
                        />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {d.columns
                        .filter(col => col.toLowerCase().includes((columnFilters[d.id] || '').toLowerCase()))
                        .map(col => (
                        <button 
                          key={col} 
                          onClick={() => createSeries(d.id, col)}
                          style={{ fontSize: '10px', padding: '2px 4px', cursor: 'pointer', background: '#e9ecef', border: '1px solid #ced4da', borderRadius: '3px' }}
                        >
                          {col}
                        </button>
                      ))}
                      {d.columns.filter(col => col.toLowerCase().includes((columnFilters[d.id] || '').toLowerCase())).length === 0 && (
                        <span style={{ fontSize: '10px', color: '#999' }}>No columns found.</span>
                      )}
                    </div>
                  </details>
                </div>
              ))}
            </div>}
          </div>

          <div className="section">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
              <div onClick={() => toggleSection('series')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}>
                <ChevronRight size={14} style={{ marginRight: '4px', transition: 'transform 0.15s', transform: openSections.series ? 'rotate(90deg)' : 'none' }} />
                <Layout size={14} style={{ marginRight: '5px' }} />
                Data Series
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '10px', color: '#666' }}>Global X:</span>
                <select
                  name="global-x-column"
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
                  aria-label="Toggle X-Mode"
                >
                  {xMode === 'date' ? <Clock size={12} /> : <Hash size={12} />}
                </button>
              </div>
            </div>
            {openSections.series && <div className="series-list" style={{ marginBottom: '1rem' }}>
              {series.length === 0 && <p style={{ fontSize: '0.8rem', color: '#666' }}>Click a column above to add a series.</p>}
              {[...series].reverse().map((s, i) => {
                const dataset = datasets.find(d => d.id === s.sourceId);
                return (
                  <SeriesConfigUI
                    key={s.id}
                    series={s}
                    dataset={dataset}
                    isFirst={i === 0}
                    isLast={i === series.length - 1}
                    onMove={(delta) => moveSeries(s.id, delta)}
                  />
                );
              })}
            </div>}
          </div>

          <div className="section">
            <div className="section-title" onClick={() => toggleSection('views')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <ChevronRight size={14} style={{ marginRight: '4px', transition: 'transform 0.15s', transform: openSections.views ? 'rotate(90deg)' : 'none' }} />
                <Eye size={14} style={{ marginRight: '5px' }} />
                Data Views
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); saveView(''); }}
                style={{ padding: '4px 12px', cursor: 'pointer', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px' }}
              >
                New View
              </button>
            </div>
            {openSections.views && <div style={{ padding: '8px', border: '1px solid #dee2e6', borderRadius: '4px', background: '#fff', marginBottom: '1rem' }}>
              
              {customViews.length === 0 && (
                <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', padding: '4px' }}>No saved views.</div>
              )}
              
              {customViews.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {customViews.map(v => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px', background: '#f8f9fa', borderRadius: '3px', border: '1px solid #e9ecef' }}>
                      {editingViewId === v.id ? (
                        <input
                          autoFocus
                          name="view-name"
                          autoComplete="off"
                          value={tempViewName}
                          onChange={(e) => setTempViewName(e.target.value)}
                          onBlur={() => {
                            if (tempViewName.trim()) updateViewName(v.id, tempViewName.trim());
                            setEditingViewId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (tempViewName.trim()) updateViewName(v.id, tempViewName.trim());
                              setEditingViewId(null);
                            }
                            if (e.key === 'Escape') setEditingViewId(null);
                          }}
                          style={{ flex: 1, fontSize: '12px', padding: '0 2px', height: '18px', marginRight: '8px' }}
                        />
                      ) : (
                        <span 
                          onClick={() => { setEditingViewId(v.id); setTempViewName(v.name); }}
                          style={{ fontSize: '12px', fontWeight: 'bold', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px', cursor: 'text' }} 
                          title="Click to rename"
                        >
                          {v.name}
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                          onClick={() => applyView(v.id)}
                          style={{ padding: '2px', cursor: 'pointer', background: 'none', border: 'none', color: '#4CAF50', display: 'flex' }}
                          title="Apply view bounds"
                          aria-label="Apply view bounds"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          onClick={() => deleteView(v.id)}
                          style={{ padding: '2px', cursor: 'pointer', background: 'none', border: 'none', color: '#dc3545', display: 'flex' }}
                          title="Delete view"
                          aria-label="Delete view"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>

          <div className="section" style={{ marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid #dee2e6' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <button
                onClick={handleExportSVG}
                style={{ flex: 1, padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <FileImage size={14} /> Export SVG
              </button>
              <button
                onClick={handleExportPNG}
                style={{ flex: 1, padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Image size={14} /> Export PNG
              </button>
            </div>
            <button
              onClick={async () => {
                if (confirm('Delete all datasets and reset all settings?')) {
                  localStorage.removeItem('webgraphy-state');
                  const db = await indexedDB.open('webgraphy-db');
                  db.onsuccess = () => {
                    const database = db.result;
                    const transaction = database.transaction(['datasets'], 'readwrite');
                    transaction.objectStore('datasets').clear();
                    transaction.oncomplete = () => window.location.reload();
                  };
                }
              }}
              style={{ width: '100%', padding: '8px', cursor: 'pointer', background: '#fff', color: '#dc3545', border: '1px solid #dc3545', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#999', paddingBottom: '0.5rem' }}>
            <span>v0.3.4</span>
            <span>|</span>
            <button 
              onClick={() => setShowImprint(true)} 
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: '10px' }}
            >
              Imprint
            </button>
            <span>|</span>
            <button 
              onClick={() => setShowLicense(true)} 
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: '10px' }}
            >
              License
            </button>
          </div>
        </div>

        {/* Resizer overlay positioned relative to sidebar */}
        {!isCollapsed && (
          <div 
            onMouseDown={() => setIsResizing(true)}
            style={{
              position: 'absolute',
              left: 0,
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
      </aside>
      {showImprint && <ImprintModal onClose={() => setShowImprint(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
      {pendingFile && (
        <ImportSettingsDialog
          fileName={pendingFile.file.name}
          fileContent={pendingFile.preview}
          fileType={pendingFile.type}
          onConfirm={confirmImport}
          onCancel={cancelImport}
        />
      )}
    </>
  );
};
