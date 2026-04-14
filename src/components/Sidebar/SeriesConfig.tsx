import React, { useState } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { type SeriesConfig, type Dataset } from '../../services/persistence';
import { THEMES, type ThemeName } from '../../themes';
import { Trash2, Circle, Square, X, Rows, Ban, ChevronUp, ChevronDown, Eye, EyeOff, Spline } from 'lucide-react';

interface Props {
  series: SeriesConfig;
  dataset: Dataset | undefined;
  isFirst?: boolean;
  isLast?: boolean;
  onMove?: (delta: -1 | 1) => void;
  themeName?: ThemeName;
}

export const SeriesConfigUI: React.FC<Props> = ({ series, dataset, isFirst, isLast, onMove, themeName = 'light' }) => {
  const t = THEMES[themeName];
  const { updateSeries, removeSeries, yAxes, updateYAxis, updateSeriesVisibility } = useGraphStore();
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const bg = t.bg2;
  const bg2 = t.bg3;
  const border = t.border2;
  const rowBorder = t.border;
  const color = t.textMuted;

  const handleUpdate = (updates: Partial<SeriesConfig>) => {
    updateSeries(series.id, updates);
  };

  const toggleVisibility = () => {
    updateSeriesVisibility(series.id, !series.hidden);
  };

  const currentYAxisIndex = parseInt(series.yAxisId.split('-')[1]) || 1;
  const currentYAxis = yAxes.find(a => a.id === series.yAxisId);

  const cycleYAxis = () => {
    const nextIndex = (currentYAxisIndex % 9) + 1;
    handleUpdate({ yAxisId: `axis-${nextIndex}` });
  };

  const renderPointStyleIcon = () => {
    const size = 12;
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
      <svg width="18" height="18" viewBox="0 0 16 16" style={{ display: 'block' }}>
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

  const renderLineWidthIcon = () => {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" style={{ display: 'block' }}>
        <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth={Math.min(4.5, series.lineWidth * 1.5)} />
      </svg>
    );
  };

  return (
    <div style={{ borderBottom: `1px solid ${rowBorder}`, padding: '4px 0', fontSize: 'var(--mobile-font-size)', display: 'grid', gridTemplateColumns: 'var(--touch-target-size) var(--touch-target-size) repeat(8, var(--touch-target-size)) 100px 1fr var(--touch-target-size)', gap: '0', alignItems: 'center', opacity: series.hidden ? 0.5 : 1 }}>

      {/* Visibility Toggle */}
      <button
        onClick={toggleVisibility}
        style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', padding: '0', cursor: 'pointer', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: series.hidden ? '#94a3b8' : '#3b82f6' }}
        title={series.hidden ? "Show Series" : "Hide Series"}
        aria-label={series.hidden ? "Show Series" : "Hide Series"}
      >
        {series.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>

      {/* Reorder Buttons (UP/DOWN) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0', background: bg2, padding: '0' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onMove?.(-1); }}
          disabled={isFirst}
          style={{ padding: '0', cursor: isFirst ? 'default' : 'pointer', background: 'none', border: 'none', color: isFirst ? border : color, height: 'calc(var(--touch-target-size) / 2)', width: 'var(--touch-target-size)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isFirst ? 0.3 : 1 }}
          title="Move Up"
         aria-label="Move Up">
          <ChevronUp size={16} strokeWidth={3} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove?.(1); }}
          disabled={isLast}
          style={{ padding: '0', cursor: isLast ? 'default' : 'pointer', background: 'none', border: 'none', color: isLast ? border : color, height: 'calc(var(--touch-target-size) / 2)', width: 'var(--touch-target-size)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isLast ? 0.3 : 1 }}
          title="Move Down (Layer Backward)"
         aria-label="Move Down">
          <ChevronDown size={16} strokeWidth={3} />
        </button>
      </div>

      {/* Y Axis Cycle Button (1-9) */}
      <button
        onClick={cycleYAxis}
        style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', fontSize: 'var(--mobile-font-size)', padding: '0', cursor: 'pointer', background: bg, border: `1px solid ${border}`, borderRadius: '0', fontWeight: 'bold', flexShrink: 0, color }}
        title="Cycle Y-Axis (1-9)"
       aria-label="Cycle Y-Axis">
        {currentYAxisIndex}
      </button>

      {/* L/R Side Toggle */}
      {currentYAxis ? (
        <button
          onClick={() => updateYAxis(currentYAxis.id, { position: currentYAxis.position === 'left' ? 'right' : 'left' })}
          style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', fontSize: 'var(--mobile-font-size)', padding: '0', cursor: 'pointer', background: bg2, border: `1px solid ${border}`, borderRadius: '0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}
          title={currentYAxis.position === 'left' ? "Left Axis" : "Right Axis"}
         aria-label="Toggle Left/Right Axis">
          {currentYAxis.position === 'left' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 13V2m-2 3l2-3 2 3M3 13h11m-3-2l3 2-3 2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 13V2m-2 3l2-3 2 3M13 13H2m3-2l-3 2 3 2" />
            </svg>
          )}
        </button>
      ) : <div style={{ width: 'var(--touch-target-size)' }} />}

      {/* Grid Toggle */}
      {currentYAxis ? (
        <button
          onClick={() => updateYAxis(currentYAxis.id, { showGrid: !currentYAxis.showGrid })}
          style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', padding: '0', cursor: 'pointer', background: currentYAxis.showGrid ? bg2 : bg, border: `1px solid ${border}`, borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}
          title="Toggle Grid"
         aria-label="Toggle Grid">
          {currentYAxis.showGrid ? <Rows size={16} /> : <Square size={16} />}
        </button>
      ) : <div style={{ width: 'var(--touch-target-size)' }} />}

      {/* Line Style Cycle */}
      <button
        onClick={() => {
          const styles = ['solid', 'dashed', 'dotted', 'none'] as const;
          const next = styles[(styles.indexOf(series.lineStyle) + 1) % styles.length];
          handleUpdate({ lineStyle: next });
        }}
        style={{ padding: '0', cursor: 'pointer', background: bg, border: `1px solid ${border}`, borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', flexShrink: 0, color }}
        title={`Line Style: ${series.lineStyle}`}
       aria-label="Cycle Line Style">
        {renderLineStyleIcon()}
      </button>

      {/* Line Width Cycle */}
      <button
        onClick={() => {
          const widths = [1, 1.5, 2, 2.5, 3];
          const next = widths[(widths.indexOf(series.lineWidth) + 1) % widths.length];
          handleUpdate({ lineWidth: next });
        }}
        style={{ padding: '0', cursor: 'pointer', background: bg, border: `1px solid ${border}`, borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', flexShrink: 0, color }}
        title={`Line Width: ${series.lineWidth}`}
       aria-label="Cycle Line Width">
        {renderLineWidthIcon()}
      </button>

      {/* Point Style Cycle */}
      <button
        onClick={() => {
          const styles = ['circle', 'square', 'cross', 'none'] as const;
          const next = styles[(styles.indexOf(series.pointStyle) + 1) % styles.length];
          handleUpdate({ pointStyle: next });
        }}
        style={{ padding: '0', cursor: 'pointer', background: 'none', border: `1px solid ${border}`, borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', flexShrink: 0, color }}
        title="Point Style"
       aria-label="Cycle Point Style">
        {renderPointStyleIcon()}
      </button>

      {/* Smoothing Toggle */}
      <button
        onClick={() => handleUpdate({ smooth: !series.smooth })}
        style={{ padding: '0', cursor: 'pointer', background: series.smooth ? bg2 : bg, border: `1px solid ${border}`, borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', flexShrink: 0, color: series.smooth ? '#3b82f6' : color }}
        title={series.smooth ? "Disable Smoothing" : "Enable Smoothing"}
        aria-label="Toggle Smoothing">
        <Spline size={16} />
      </button>

      {/* Color Picker */}
      <input
        type="color"
        name={`series-color-${series.id}`}
        aria-label={`Color for ${series.name || series.yColumn}`}
        value={series.lineColor}
        onInput={(e) => {
          const inputColor = (e.target as HTMLInputElement).value;
          handleUpdate({ lineColor: inputColor, pointColor: inputColor });
        }}
        style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', padding: 0, border: 'none', cursor: 'pointer', flexShrink: 0, borderRadius: '0' }}
        title="Color"
      />

      {/* Y Column Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <select
          name={`series-y-column-${series.id}`}
          aria-label={`Y Column for ${series.name || series.yColumn}`}
          value={series.yColumn}
          onChange={(e) => handleUpdate({ yColumn: e.target.value })}
          style={{ width: '100px', fontSize: 'var(--mobile-font-size)', padding: '2px', height: 'var(--touch-target-size)', minWidth: 0, flexShrink: 1, borderRadius: '0', border: `1px solid ${border}`, color, background: bg }}
          title="Y Column"
        >
          {dataset?.columns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Editable Title */}
      <div style={{ flex: '1 1 150px', minWidth: '40px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
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
            style={{ width: '100%', fontSize: 'var(--mobile-font-size)', padding: '4px', height: 'var(--touch-target-size)', background: bg, color, border: `1px solid ${border}` }}
          />
        ) : (
          <span
            onClick={() => setIsEditingTitle(true)}
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold', color: series.lineColor, fontSize: 'var(--mobile-font-size)', cursor: 'text', width: '100%', padding: '4px 0' }}
            title="Click to rename"
          >
            {series.name || series.yColumn}
          </span>
        )}
      </div>

      {/* Delete Button */}
      <button onClick={() => removeSeries(series.id)} style={{ padding: '8px', cursor: 'pointer', color: t.danger, border: 'none', background: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--touch-target-size)', height: 'var(--touch-target-size)' }} title="Delete" aria-label="Delete Series">
        <Trash2 size={20} />
      </button>
    </div>
  );
};
