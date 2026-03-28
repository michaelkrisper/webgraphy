import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { type Viewport, screenToWorld, worldToScreen } from '../../utils/coords';
import { WebGLRenderer } from './WebGLRenderer';
import { useGraphStore } from '../../store/useGraphStore';

const AXIS_WIDTH = 60;
const BASE_PADDING = { top: 20, right: 20, bottom: 50, left: 20 };

type PanTarget = 'all' | 'x' | { yAxisId: string };

export const PlotArea: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { datasets, series, yAxes, axisTitles, viewportX, setViewportX, updateYAxis } = useGraphStore();
  
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);

  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);

  const leftAxes = useMemo(() => yAxes.filter(a => a.position === 'left'), [yAxes]);
  const rightAxes = useMemo(() => yAxes.filter(a => a.position === 'right'), [yAxes]);

  const padding = useMemo(() => ({
    ...BASE_PADDING,
    left: BASE_PADDING.left + (leftAxes.length * AXIS_WIDTH),
    right: BASE_PADDING.right + (rightAxes.length * AXIS_WIDTH)
  }), [leftAxes.length, rightAxes.length]);

  const chartWidth = Math.max(0, width - padding.left - padding.right);
  const chartHeight = Math.max(0, height - padding.top - padding.bottom);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth);
        setHeight(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleWheel = (e: React.WheelEvent, target: 'all' | 'x' | { yAxisId: string }) => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    
    // Zoom X
    if (target === 'all' || target === 'x') {
      const range = viewportX.max - viewportX.min;
      const newRange = range * zoomFactor;
      setViewportX({
        min: viewportX.min + (range - newRange) / 2,
        max: viewportX.max - (range - newRange) / 2
      });
    }

    // Zoom Y (Specific or All)
    if (target === 'all' || typeof target === 'object') {
      const axesToZoom = target === 'all' ? yAxes : [yAxes.find(a => a.id === (target as any).yAxisId)!];
      axesToZoom.forEach(axis => {
        if (!axis) return;
        const range = axis.max - axis.min;
        const newRange = range * zoomFactor;
        updateYAxis(axis.id, {
          min: axis.min + (range - newRange) / 2,
          max: axis.max - (range - newRange) / 2
        });
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent, target: PanTarget = 'all') => {
    setPanTarget(target);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    
    if (!panTarget || !lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    // Pan X
    if (panTarget === 'all' || panTarget === 'x') {
      const xRange = viewportX.max - viewportX.min;
      const xMove = chartWidth > 0 ? (dx / chartWidth) * xRange : 0;
      setViewportX({ min: viewportX.min - xMove, max: viewportX.max - xMove });
    }

    // Pan Y
    if (panTarget === 'all' || typeof panTarget === 'object') {
      const axesToPan = panTarget === 'all' ? yAxes : [yAxes.find(a => a.id === (panTarget as any).yAxisId)!];
      axesToPan.forEach(axis => {
        if (!axis) return;
        const yRange = axis.max - axis.min;
        const yMove = chartHeight > 0 ? (dy / chartHeight) * yRange : 0;
        updateYAxis(axis.id, { min: axis.min + yMove, max: axis.max + yMove });
      });
    }
  }, [panTarget, width, height, padding, viewportX, yAxes, chartWidth, chartHeight]);

  useEffect(() => {
    if (panTarget) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', () => setPanTarget(null));
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', () => setPanTarget(null));
    };
  }, [panTarget, handleMouseMove]);

  const calculateTicks = (min: number, max: number, pixelLength: number, isDate: boolean, approxWidth: number) => {
    const range = max - min;
    const maxTicks = Math.max(2, Math.floor(pixelLength / (approxWidth + 10)));
    let step = range / maxTicks;
    let precision = 0;
    if (!isDate) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
      const normalizedStep = step / magnitude;
      let finalStep = 1;
      if (normalizedStep < 1.5) finalStep = 1;
      else if (normalizedStep < 3) finalStep = 2;
      else if (normalizedStep < 7) finalStep = 5;
      else finalStep = 10;
      step = finalStep * magnitude;
      precision = Math.max(0, -Math.floor(Math.log10(step)));
    } else {
      const intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 259200, 432000, 604800, 1209600, 2592000];
      step = intervals.find(i => i > step) || intervals[intervals.length - 1];
    }
    const firstTick = Math.ceil(min / step) * step;
    const result = [];
    for (let t = firstTick; t <= max; t += step) { result.push(t); }
    return { result, step, precision };
  };

  const isXDate = viewportX.min > 1000000000;
  const xTicks = calculateTicks(viewportX.min, viewportX.max, chartWidth, isXDate, 50);

  const formatDate = (val: number, step: number) => {
    const d = new Date(val * 1000);
    if (step >= 86400) return d.getDate() + '.' + (d.getMonth()+1) + '.';
    if (step >= 3600) return d.getHours() + ':00';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  const viewportRef = { ...viewportX, xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding };

  return (
    <main className="plot-area" ref={containerRef} onMouseDown={(e) => handleMouseDown(e, 'all')} onWheel={(e) => handleWheel(e, 'all')} onMouseLeave={() => setMousePos(null)} style={{ position: 'relative', cursor: panTarget ? 'grabbing' : 'crosshair', backgroundColor: '#fff', overflow: 'hidden' }}>
      
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        {/* X-Grid */}
        {chartWidth > 0 && xTicks.result.map(t => {
          const { x } = worldToScreen(t, 0, viewportRef);
          return <line key={`gx-${t}`} x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#f0f0f0" strokeWidth="1" />;
        })}
        {/* Y-Grid (from all axes with showGrid enabled) */}
        {yAxes.map(axis => {
          if (!axis.showGrid || chartHeight <= 0) return null;
          const axisTicks = calculateTicks(axis.min, axis.max, chartHeight, false, 20);
          return axisTicks.result.map(t => {
            const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
            return <line key={`gy-${axis.id}-${t}`} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f0f0f0" strokeWidth="1" />;
          });
        })}
      </svg>

      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <WebGLRenderer datasets={datasets} series={series} yAxes={yAxes} viewportX={viewportX} width={width} height={height} padding={padding} />
      </div>

      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
        <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} fill="none" stroke="#333" strokeWidth="2" />
        {chartWidth > 0 && xTicks.result.map(t => {
          const { x } = worldToScreen(t, 0, viewportRef);
          if (x < padding.left || x > width - padding.right) return null;
          return <line key={`xt-${t}`} x1={x} y1={height - padding.bottom} x2={x} y2={height - padding.bottom + 6} stroke="#333" strokeWidth="1" />;
        })}
        {yAxes.map((axis) => {
          const isLeft = axis.position === 'left';
          const sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
          const xPos = isLeft ? (padding.left - (sideIdx + 1) * AXIS_WIDTH) : (width - padding.right + sideIdx * AXIS_WIDTH);
          const axisTicks = calculateTicks(axis.min, axis.max, chartHeight, false, 20);
          return (
            <g key={axis.id}>
              <line x1={xPos + (isLeft ? AXIS_WIDTH : 0)} y1={padding.top} x2={xPos + (isLeft ? AXIS_WIDTH : 0)} y2={height - padding.bottom} stroke="#333" strokeWidth="1" />
              {chartHeight > 0 && axisTicks.result.map(t => {
                const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
                return <line key={`yt-${axis.id}-${t}`} x1={xPos + (isLeft ? AXIS_WIDTH - 5 : 0)} y1={y} x2={xPos + (isLeft ? AXIS_WIDTH : 5)} y2={y} stroke="#333" strokeWidth="1" />;
              })}
            </g>
          );
        })}
      </svg>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 7 }}>
        {chartWidth > 0 && xTicks.result.map(t => {
          const { x } = worldToScreen(t, 0, viewportRef);
          if (x < padding.left || x > width - padding.right) return null;
          return <div key={`xl-${t}`} style={{ position: 'absolute', left: x, bottom: padding.bottom - 20, transform: 'translateX(-50%)', fontSize: '9px', color: '#666' }}>{isXDate ? formatDate(t, xTicks.step) : t.toFixed(xTicks.precision)}</div>;
        })}
        {yAxes.map((axis) => {
          const isLeft = axis.position === 'left';
          const sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
          const xPos = isLeft ? (padding.left - (sideIdx + 1) * AXIS_WIDTH) : (width - padding.right + sideIdx * AXIS_WIDTH);
          const axisTicks = calculateTicks(axis.min, axis.max, chartHeight, false, 20);
          return axisTicks.result.map(t => {
            const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
            return <div key={`yl-${axis.id}-${t}`} style={{ position: 'absolute', left: xPos + 5, top: y, transform: 'translateY(-50%)', fontSize: '9px', color: '#333', width: AXIS_WIDTH - 10, textAlign: isLeft ? 'right' : 'left' }}>{t.toFixed(axisTicks.precision)}</div>;
          });
        })}
      </div>

      {/* Axis Interaction Overlays */}
      <div 
        onWheel={(e) => { e.stopPropagation(); handleWheel(e, 'x'); }} 
        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'x'); }}
        style={{ position: 'absolute', bottom: 0, left: padding.left, right: padding.right, height: padding.bottom, cursor: 'ew-resize', zIndex: 20 }} 
      />
      {yAxes.map((axis) => {
        const isLeft = axis.position === 'left';
        const sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
        const xPos = isLeft ? (padding.left - (sideIdx + 1) * AXIS_WIDTH) : (width - padding.right + sideIdx * AXIS_WIDTH);
        return (
          <div 
            key={`wheel-${axis.id}`} 
            onWheel={(e) => { e.stopPropagation(); handleWheel(e, { yAxisId: axis.id }); }} 
            onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { yAxisId: axis.id }); }}
            style={{ position: 'absolute', left: xPos, top: padding.top, width: AXIS_WIDTH, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} 
          />
        );
      })}

      <div style={{ position: 'absolute', bottom: '5px', width: '100%', textAlign: 'center', pointerEvents: 'none', fontWeight: 'bold', zIndex: 25 }}>{axisTitles.x}</div>
    </main>
  );
};
