import React, { useState, useCallback, useRef } from 'react';
import { type SeriesConfig } from '../../services/persistence';
import { type Theme } from '../../themes';

interface ChartLegendProps {
  series: SeriesConfig[];
  theme: Theme;
  onToggleVisibility: (id: string, hidden: boolean) => void;
  onHighlight: (id: string | null) => void;
}

export const ChartLegend: React.FC<ChartLegendProps> = ({ series, theme, onToggleVisibility, onHighlight }) => {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-legend-item]')) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: position.x, origY: position.y };
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition({
        x: Math.max(0, dragRef.current.origX + (ev.clientX - dragRef.current.startX)),
        y: Math.max(0, dragRef.current.origY + (ev.clientY - dragRef.current.startY))
      });
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [position]);

  const visibleSeries = series.filter(s => s.lineStyle !== 'none' || s.pointStyle !== 'none');
  if (visibleSeries.length === 0) return null;

  const lineStyleDash = (style: string) => {
    if (style === 'dashed') return '6,4';
    if (style === 'dotted') return '2,3';
    return 'none';
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 25,
        backgroundColor: theme.tooltipBg,
        border: `1px solid ${theme.tooltipBorder}`,
        borderRadius: '6px',
        padding: '6px 10px',
        cursor: 'grab',
        userSelect: 'none',
        fontSize: '11px',

        color: theme.tooltipColor,
        boxShadow: `0 2px 8px ${theme.shadow}`,
        maxWidth: '300px',
        maxHeight: '400px',
        overflowY: 'auto',
      }}
    >
      {visibleSeries.map(s => (
        <div
          key={s.id}
          data-legend-item
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(s.id, !s.hidden); }}
          onMouseEnter={() => onHighlight(s.id)}
          onMouseLeave={() => onHighlight(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 0',
            cursor: 'pointer',
            opacity: s.hidden ? 0.35 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          <svg width="20" height="10" style={{ flexShrink: 0 }}>
            {s.lineStyle !== 'none' && (
              <line
                x1="0" y1="5" x2="20" y2="5"
                stroke={s.lineColor}
                strokeWidth={Math.min(s.lineWidth, 3)}
                strokeDasharray={lineStyleDash(s.lineStyle)}
              />
            )}
            {s.pointStyle === 'circle' && <circle cx="10" cy="5" r="2.5" fill={s.pointColor} />}
            {s.pointStyle === 'square' && <rect x="7.5" y="2.5" width="5" height="5" fill={s.pointColor} />}
            {s.pointStyle === 'cross' && <path d="M7.5 2.5 L12.5 7.5 M12.5 2.5 L7.5 7.5" stroke={s.pointColor} strokeWidth="1.5" />}
          </svg>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textDecoration: s.hidden ? 'line-through' : 'none',
          }}>
            {s.name || s.yColumn}
          </span>
        </div>
      ))}
    </div>
  );
};
