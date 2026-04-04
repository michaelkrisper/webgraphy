import React, { useState } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { type SeriesConfig, type Dataset } from '../../services/persistence';
import { Trash2, Circle, Square, X, Rows, Ban, ChevronUp, ChevronDown } from 'lucide-react';

interface Props {
  series: SeriesConfig;
  dataset: Dataset | undefined;
  isFirst?: boolean;
  isLast?: boolean;
  onMove?: (delta: -1 | 1) => void;
}

/**
 * SeriesConfigUI Component
 * Provides an extremely compact UI for configuring an individual data series in a single row.
 */
export const SeriesConfigUI: React.FC<Props> = ({ series, dataset, isFirst, isLast, onMove }) => {
  const { updateSeries, removeSeries, yAxes, updateYAxis } = useGraphStore();
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const handleUpdate = (updates: Partial<SeriesConfig>) => {
    updateSeries(series.id, updates);
  };

  const currentAxisIndex = parseInt(series.yAxisId.split('-')[1]) || 1;
  const currentAxis = yAxes.find(a => a.id === series.yAxisId);

  const cycleAxis = () => {
    const nextIndex = (currentAxisIndex % 9) + 1;
    handleUpdate({ yAxisId: `axis-${nextIndex}` });
  };

  const renderPointStyleIcon = () => {
    const size = 10;
    switch (series.pointStyle) {
      case 'circle': return <Circle size={size} fill="currentColor" />;
      case 'square': return <Square size={size} fill="currentColor" />;
      case 'cross': return <X size={size + 2} strokeWidth={3} />;
      case 'none': return <Ban size={size + 2} strokeWidth={2.5} opacity={0.5} />;
      default: return null;
    }
  };

  const renderLineStyleIcon = () => {
    const color = "currentColor";
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" style={{ display: 'block' }}>
        {series.lineStyle === 'solid' && <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" />}
        {series.lineStyle === 'dashed' && <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" strokeDasharray="4,3" />}
        {series.lineStyle === 'dotted' && <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" strokeDasharray="1,3" strokeLinecap="round" />}
        {series.lineStyle === 'none' && (
          <g opacity="0.4">
            <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1" strokeDasharray="2,2" />
            <line x1="4" y1="4" x2="12" y2="12" stroke="#dc3545" strokeWidth="1.5" opacity="1" />
          </g>
        )}
      </svg>
    );
  };

  return (
    <div style={{ borderBottom: '1px solid #dee2e6', padding: '4px 0', fontSize: '11px', display: 'flex', gap: '4px', alignItems: 'center' }}>
      {/* Color Picker */}
      <input
        type="color"
        name={`series-color-${series.id}`}
        aria-label={`Color for ${series.name || series.yColumn}`}
        value={series.lineColor}
        onInput={(e) => {
          const color = (e.target as HTMLInputElement).value;
          handleUpdate({ lineColor: color, pointColor: color });
        }}
        style={{ width: '18px', height: '18px', padding: 0, border: 'none', cursor: 'pointer', flexShrink: 0, borderRadius: '2px' }}
        title="Color"
      />

      {/* L/R Side Toggle */}
      {currentAxis && (
        <button
          onClick={() => updateYAxis(currentAxis.id, { position: currentAxis.position === 'left' ? 'right' : 'left' })}
          style={{ width: '18px', height: '18px', fontSize: '9px', padding: '0', cursor: 'pointer', background: '#e9ecef', border: '1px solid #ced4da', borderRadius: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={currentAxis.position === 'left' ? "Left Axis" : "Right Axis"}
         aria-label="Toggle Left/Right Axis">
          {currentAxis.position === 'left' ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 13V2m-2 3l2-3 2 3M3 13h11m-3-2l3 2-3 2" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 13V2m-2 3l2-3 2 3M13 13H2m3-2l-3 2 3 2" />
            </svg>
          )}
        </button>
      )}
      
      {/* Point Style Cycle */}
      <button 
        onClick={() => {
          const styles = ['circle', 'square', 'cross', 'none'] as const;
          const next = styles[(styles.indexOf(series.pointStyle) + 1) % styles.length];
          handleUpdate({ pointStyle: next });
        }}
        style={{ padding: '0', cursor: 'pointer', background: 'none', border: '1px solid #ced4da', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', flexShrink: 0 }}
        title="Point Style"
       aria-label="Cycle Point Style">
        {renderPointStyleIcon()}
      </button>

      {/* Line Style Cycle */}
      <button 
        onClick={() => {
          const styles = ['solid', 'dashed', 'dotted', 'none'] as const;
          const next = styles[(styles.indexOf(series.lineStyle) + 1) % styles.length];
          handleUpdate({ lineStyle: next });
        }}
        style={{ padding: '0', cursor: 'pointer', background: '#f8f9fa', border: '1px solid #ced4da', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', flexShrink: 0 }}
        title={`Line Style: ${series.lineStyle}`}
       aria-label="Cycle Line Style">
        {renderLineStyleIcon()}
      </button>

      {/* Y Axis Cycle Button (1-9) */}
      <button
        onClick={cycleAxis}
        style={{ width: '18px', height: '18px', fontSize: '10px', padding: '0', cursor: 'pointer', background: '#f8f9fa', border: '1px solid #ced4da', borderRadius: '2px', fontWeight: 'bold', flexShrink: 0 }}
        title="Cycle Y-Axis (1-9)"
       aria-label="Cycle Y-Axis">
        {currentAxisIndex}
      </button>

      {/* Y Column Selector */}
      <select
        name={`series-y-column-${series.id}`}
        aria-label={`Y Column for ${series.name || series.yColumn}`}
        value={series.yColumn}
        onChange={(e) => handleUpdate({ yColumn: e.target.value })}
        style={{ width: '80px', fontSize: '9px', padding: '0', height: '18px', minWidth: 0, flexShrink: 1 }}
        title="Y Column"
      >
        {dataset?.columns.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* Grid Toggle */}
      {currentAxis && (
        <button
          onClick={() => updateYAxis(currentAxis.id, { showGrid: !currentAxis.showGrid })}
          style={{ width: '18px', height: '18px', padding: '0', cursor: 'pointer', background: currentAxis.showGrid ? '#e9ecef' : '#f8f9fa', border: '1px solid #ced4da', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          title="Toggle Grid"
         aria-label="Toggle Grid">
          {currentAxis.showGrid ? <Rows size={10} /> : <Square size={10} />}
        </button>
      )}

      {/* Editable Title */}
      <div style={{ flex: '2', minWidth: '40px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {isEditingTitle ? (
          <input
            autoFocus
            name={`series-title-${series.id}`}
            aria-label="Rename series"
            autoComplete="off"
            maxLength={100}
            defaultValue={series.name || series.yColumn}
            onBlur={(e) => { handleUpdate({ name: e.target.value }); setIsEditingTitle(false); }}
            onKeyDown={(e) => { 
              if (e.key === 'Enter') { handleUpdate({ name: e.currentTarget.value }); setIsEditingTitle(false); }
              if (e.key === 'Escape') { setIsEditingTitle(false); }
            }}
            style={{ width: '100%', fontSize: '10px', padding: '0 2px', height: '16px' }}
          />
        ) : (
          <span 
            onClick={() => setIsEditingTitle(true)}
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold', color: series.lineColor, fontSize: '10px', cursor: 'text', width: '100%' }}
            title="Click to rename"
          >
            {series.name || series.yColumn}
          </span>
        )}
      </div>

      {/* Reorder Buttons (UP/DOWN) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#eef1f4', borderRadius: '3px', padding: '1px' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onMove?.(1); }}
          disabled={isFirst}
          style={{ padding: '0', cursor: isFirst ? 'default' : 'pointer', background: 'none', border: 'none', color: isFirst ? '#ccc' : '#444', height: '11px', display: 'flex', alignItems: 'center', opacity: isFirst ? 0.3 : 1 }}
          title="Move Up (Layer Forward)"
         aria-label="Move Up">
          <ChevronUp size={12} strokeWidth={3} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove?.(-1); }}
          disabled={isLast}
          style={{ padding: '0', cursor: isLast ? 'default' : 'pointer', background: 'none', border: 'none', color: isLast ? '#ccc' : '#444', height: '11px', display: 'flex', alignItems: 'center', opacity: isLast ? 0.3 : 1 }}
          title="Move Down (Layer Backward)"
         aria-label="Move Down">
          <ChevronDown size={12} strokeWidth={3} />
        </button>
      </div>

      {/* Delete Button */}
      <button onClick={() => removeSeries(series.id)} style={{ padding: '2px', cursor: 'pointer', color: '#dc3545', border: 'none', background: 'none', flexShrink: 0 }} title="Delete" aria-label="Delete Series">
        <Trash2 size={12} />
      </button>
    </div>
  );
};
