// src/hooks/usePanZoom.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { screenToWorld } from '../utils/coords';
import { type XAxisConfig, type YAxisConfig } from '../services/persistence';
import { type PanTarget } from '../components/Plot/chartTypes';

interface UsePanZoomOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  chartWidth: number;
  chartHeight: number;
  activeXAxes: XAxisConfig[];
  activeYAxes: YAxisConfig[];
  xAxesById: Map<string, XAxisConfig>;
  yAxesById: Map<string, YAxisConfig>;
  targetXAxes: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  targetYs: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  syncViewport: (force?: boolean) => void;
  xAxesMetrics: Array<{ id: string; height: number; cumulativeOffset: number }>;
  axisLayout: Record<string, { total: number; label: number }>;
  leftAxes: YAxisConfig[];
  rightAxes: YAxisConfig[];
  handleAutoScaleX: (xAxisId?: string) => void;
  handleAutoScaleY: (axisId: string, mouseY?: number) => void;
  pressedKeys: React.MutableRefObject<Set<string>>;
  onPanEnd: () => void;
  panStateRef: React.MutableRefObject<{ active: boolean; startX: number; startY: number; currentX: number; currentY: number; target: PanTarget | null; startTargetX: Record<string, { min: number; max: number }>; startTargetY: Record<string, { min: number; max: number }> }>;
}

interface UsePanZoomResult {
  panTarget: PanTarget | null;
  isCtrlPressed: boolean;
  isShiftPressed: boolean;
  isInteracting: boolean;
  zoomBoxState: { startX: number; startY: number; endX: number; endY: number } | null;
  handleMouseDown: (e: React.MouseEvent, target?: PanTarget) => void;
  handleTouchStart: (e: React.TouchEvent, target?: PanTarget) => void;
  handleWheel: (e: React.WheelEvent, target?: PanTarget) => void;
}

export function usePanZoom({
  containerRef, width, height, padding, chartWidth, chartHeight,
  activeXAxes, activeYAxes, xAxesById, yAxesById,
  targetXAxes, targetYs, syncViewport,
  xAxesMetrics, axisLayout, leftAxes, rightAxes,
  handleAutoScaleX, handleAutoScaleY, pressedKeys, onPanEnd,
  panStateRef,
}: UsePanZoomOptions): UsePanZoomResult {
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [zoomBoxState, setZoomBoxState] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [isWheeling, setIsWheeling] = useState(false);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRectRef = useRef<DOMRect | null>(null);

  const isInteracting = !!panTarget || !!zoomBoxState || isWheeling;

  const updatePan = useCallback(() => {
    const ps = panStateRef.current;
    if (!ps.active || !ps.target) return;

    const dx = ps.currentX - ps.startX;
    const dy = ps.currentY - ps.startY;

    const xUpdates: Record<string, { min: number; max: number }> = {};
    const yUpdates: Record<string, { min: number; max: number }> = {};

    // X-Axis Panning
    if (ps.target === 'all' || (ps.target as { xAxisId?: string }).xAxisId) {
      activeXAxes.forEach(axis => {
        if (ps.target !== 'all' && (ps.target as { xAxisId?: string }).xAxisId !== axis.id) return;
        const startConf = ps.startTargetX[axis.id];
        if (!startConf) return;
        const pxPerWorld = chartWidth / (startConf.max - startConf.min);
        const shiftWorld = -dx / pxPerWorld;
        const newMin = startConf.min + shiftWorld;
        const newMax = startConf.max + shiftWorld;
        if (targetXAxes.current[axis.id].min !== newMin || targetXAxes.current[axis.id].max !== newMax) {
          targetXAxes.current[axis.id] = { min: newMin, max: newMax };
          xUpdates[axis.id] = { min: newMin, max: newMax };
        }
      });
    }

    // Y-Axis Panning
    if (ps.target === 'all' || (ps.target as { yAxisId?: string }).yAxisId) {
      activeYAxes.forEach(axis => {
        if (ps.target !== 'all' && (ps.target as { yAxisId?: string }).yAxisId !== axis.id) return;
        const startConf = ps.startTargetY[axis.id];
        if (!startConf) return;
        const pxPerWorld = chartHeight / (startConf.max - startConf.min);
        const shiftWorld = dy / pxPerWorld;
        const newMin = startConf.min + shiftWorld;
        const newMax = startConf.max + shiftWorld;
        if (targetYs.current[axis.id].min !== newMin || targetYs.current[axis.id].max !== newMax) {
          targetYs.current[axis.id] = { min: newMin, max: newMax };
          yUpdates[axis.id] = { min: newMin, max: newMax };
        }
      });
    }

    if (Object.keys(xUpdates).length > 0 || Object.keys(yUpdates).length > 0) {
      // During active panning, we rely on the parent's redraw call via syncViewport(false)
      // but we need to ensure the parent knows we moved.
      syncViewport();
    }
  }, [activeXAxes, activeYAxes, chartWidth, chartHeight, targetXAxes, targetYs, syncViewport, panStateRef]);

  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const lastTouchTime = useRef<number>(0);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const zoomBoxStartRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const hoveredAxisIdRef = useRef<string | null>(null);
  const hoveredXAxisIdRef = useRef<string | null>(null);

  const getHoveredYAxis = useCallback((mouseX: number, mouseY: number) => {
    if (mouseY < padding.top || mouseY > height - padding.bottom) return null;
    let lOff = 0;
    for (let i = 0; i < leftAxes.length; i++) {
      const am = axisLayout[leftAxes[i].id] || { total: 40 };
      if (mouseX >= padding.left - lOff - am.total && mouseX <= padding.left - lOff) return leftAxes[i].id;
      lOff += am.total;
    }
    let rOff = 0;
    for (let i = 0; i < rightAxes.length; i++) {
      const am = axisLayout[rightAxes[i].id] || { total: 40 };
      if (mouseX >= width - padding.right + rOff && mouseX <= width - padding.right + rOff + am.total) return rightAxes[i].id;
      rOff += am.total;
    }
    return null;
  }, [leftAxes, rightAxes, axisLayout, padding, width, height]);

  const getHoveredXAxis = useCallback((mouseX: number, mouseY: number) => {
    if (mouseX < padding.left || mouseX > width - padding.right) return null;
    for (const m of xAxesMetrics) {
      const baseY = height - padding.bottom + m.cumulativeOffset;
      if (mouseY >= baseY && mouseY <= baseY + m.height) return m.id;
    }
    return null;
  }, [xAxesMetrics, padding, width, height]);

  const performZoom = useCallback((zoomFactor: number, mouseX: number, mouseY: number, target: PanTarget = 'all', shiftKey = false) => {
    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const axesToZoom = (target === 'all' || shiftKey) ? activeXAxes : [xAxesById.get(target.xAxisId)!];
      axesToZoom.forEach(axis => {
        if (!axis) return;
        const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding };
        const worldMouse = screenToWorld(mouseX, 0, vp);
        const currentX = targetXAxes.current[axis.id] || { min: axis.min, max: axis.max };
        const newXRange = (currentX.max - currentX.min) * zoomFactor;
        const weight = (mouseX - padding.left) / chartWidth;
        targetXAxes.current[axis.id] = { min: worldMouse.x - weight * newXRange, max: worldMouse.x + (1 - weight) * newXRange };
      });
    }
    if ((target === 'all' && !shiftKey) || (typeof target === 'object' && 'yAxisId' in target)) {
      const axesToZoom = target === 'all' ? activeYAxes : [yAxesById.get(target.yAxisId)!];
      axesToZoom.forEach(axis => {
        if (!axis) return;
        const axisVp = { xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding };
        const worldMouse = screenToWorld(0, mouseY, axisVp);
        const currentTarget = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
        const newYRange = (currentTarget.max - currentTarget.min) * zoomFactor;
        const weight = (height - padding.bottom - mouseY) / chartHeight;
        targetYs.current[axis.id] = { min: worldMouse.y - weight * newYRange, max: worldMouse.y + (1 - weight) * newYRange };
      });
    }
    syncViewport();
  }, [activeXAxes, activeYAxes, xAxesById, yAxesById, width, height, padding, chartWidth, chartHeight, targetXAxes, targetYs, syncViewport]);

  const handleWheel = useCallback((e: React.WheelEvent, target: PanTarget = 'all') => {
    setIsWheeling(true);
    panStateRef.current.active = true;
    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => {
      setIsWheeling(false);
      panStateRef.current.active = false;
      onPanEnd();
      wheelTimeoutRef.current = null;
    }, 300);

    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) containerRectRef.current = rect;
    performZoom(zoomFactor, rect ? e.clientX - rect.left : width / 2, rect ? e.clientY - rect.top : height / 2, target, e.shiftKey);
  }, [containerRef, width, height, performZoom, onPanEnd, panStateRef]);

  const handleMouseDown = useCallback((e: React.MouseEvent, target: PanTarget = 'all') => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    containerRectRef.current = rect;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (e.ctrlKey && target === 'all') {
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        const box = { startX: x, startY: y, endX: x, endY: y };
        zoomBoxStartRef.current = box;
        setZoomBoxState(box);
      }
    } else {
      setPanTarget(target);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  }, [containerRef, padding, width, height]);

  const handleTouchStart = useCallback((e: React.TouchEvent, target: PanTarget = 'all') => {
    const now = Date.now(), isDouble = now - lastTouchTime.current < 300;
    lastTouchTime.current = now;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) containerRectRef.current = rect;

    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (!rect) return;
      if (isDouble) {
        if (target === 'all') { handleAutoScaleX(); activeYAxes.forEach(a => handleAutoScaleY(a.id)); }
        else if (typeof target === 'object') {
          if ('xAxisId' in target) handleAutoScaleX(target.xAxisId);
          else if ('yAxisId' in target) handleAutoScaleY(target.yAxisId, t.clientY - rect.top);
        }
        return;
      }
      setPanTarget(target);
      lastTouchPos.current = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) {
      setPanTarget(prev => (prev && prev !== 'all') ? prev : target);
      const t1 = e.touches[0], t2 = e.touches[1];
      lastPinchDist.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
  }, [containerRef, activeYAxes, handleAutoScaleX, handleAutoScaleY]);

  // Raw event listeners (non-React for passive:false touch)
  const panTargetRef = useRef(panTarget);
  const isShiftPressedRef = useRef(isShiftPressed);

  useEffect(() => {
    panTargetRef.current = panTarget;
    isShiftPressedRef.current = isShiftPressed;
  }, [panTarget, isShiftPressed]);

  useEffect(() => {
    const handleTouchMoveRaw = (e: TouchEvent) => {
      const target = panTargetRef.current;
      if (e.touches.length === 1 && target && lastTouchPos.current) {
        if (e.cancelable) e.preventDefault();
        const t = e.touches[0];
        const ps = panStateRef.current;
        if (!ps.active) {
          ps.active = true;
          ps.startX = lastTouchPos.current.x;
          ps.startY = lastTouchPos.current.y;
          ps.target = target;
          activeXAxes.forEach(a => { ps.startTargetX[a.id] = { ...targetXAxes.current[a.id] }; });
          activeYAxes.forEach(a => { ps.startTargetY[a.id] = { ...targetYs.current[a.id] }; });
        }
        ps.currentX = t.clientX;
        ps.currentY = t.clientY;
        updatePan();
      } else if (e.touches.length === 2 && lastPinchDist.current) {
        if (e.cancelable) e.preventDefault();
        const rect = containerRectRef.current || containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (dist === 0) return;
        const zf = lastPinchDist.current / dist;
        lastPinchDist.current = dist;
        performZoom(zf, (t1.clientX + t2.clientX) / 2 - rect.left, (t1.clientY + t2.clientY) / 2 - rect.top, target || 'all', e.shiftKey);
      }
    };

    const handleMouseMoveRaw = (e: MouseEvent) => {
      const rect = containerRectRef.current || containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      hoveredAxisIdRef.current = getHoveredYAxis(mx, my);
      hoveredXAxisIdRef.current = getHoveredXAxis(mx, my);

      if (zoomBoxStartRef.current) {
        const box = zoomBoxStartRef.current;
        box.endX = Math.max(padding.left, Math.min(width - padding.right, mx));
        box.endY = Math.max(padding.top, Math.min(height - padding.bottom, my));
        setZoomBoxState({ ...box });
        return;
      }
      const target = panTargetRef.current;
      if (!target || !lastMousePos.current) return;

      const ps = panStateRef.current;
      if (!ps.active) {
        ps.active = true;
        ps.startX = lastMousePos.current.x;
        ps.startY = lastMousePos.current.y;
        ps.target = target;
        activeXAxes.forEach(a => { ps.startTargetX[a.id] = { ...targetXAxes.current[a.id] }; });
        activeYAxes.forEach(a => { ps.startTargetY[a.id] = { ...targetYs.current[a.id] }; });
      }
      ps.currentX = e.clientX;
      ps.currentY = e.clientY;
      
      updatePan();
    };

    const handleMouseUp = () => {
      panStateRef.current.active = false;
      containerRectRef.current = null;
      
      if (zoomBoxStartRef.current) {
        const box = zoomBoxStartRef.current;
        zoomBoxStartRef.current = null;
        setZoomBoxState(null);
        const minX = Math.min(box.startX, box.endX), maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY), maxY = Math.max(box.startY, box.endY);
        if (maxX - minX > 5 && maxY - minY > 5) {
          activeXAxes.forEach(axis => {
            const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding };
            const w1 = screenToWorld(minX, maxY, vp), w2 = screenToWorld(maxX, minY, vp);
            targetXAxes.current[axis.id] = { min: w1.x, max: w2.x };
          });
          if (!isShiftPressedRef.current) {
            activeYAxes.forEach(axis => {
              const mx2 = activeXAxes[0];
              const avp = { xMin: mx2.min, xMax: mx2.max, yMin: axis.min, yMax: axis.max, width, height, padding };
              const a1 = screenToWorld(minX, maxY, avp), a2 = screenToWorld(maxX, minY, avp);
              targetYs.current[axis.id] = { min: a1.y, max: a2.y };
            });
          }
          syncViewport();
        }
      }
      onPanEnd();
      setPanTarget(null);
    };

    const handleTouchEnd = () => {
      onPanEnd();
      setPanTarget(null);
      lastTouchPos.current = null;
      lastPinchDist.current = null;
    };

    window.addEventListener('mousemove', handleMouseMoveRaw);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMoveRaw, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveRaw);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMoveRaw);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, padding, width, height, activeXAxes, activeYAxes, targetXAxes, targetYs, syncViewport, performZoom, getHoveredYAxis, getHoveredXAxis, updatePan, onPanEnd, panStateRef]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(e.type === 'keydown');
      if (e.key === 'Shift') setIsShiftPressed(e.type === 'keydown');
      if (e.type === 'keyup') {
        pressedKeys.current.delete(e.key);
      } else {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.ctrlKey && ['+', '-', '=', '_'].includes(e.key)) e.preventDefault();
        pressedKeys.current.add(e.key);
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          syncViewport();
        } else if (['+', '-'].includes(e.key)) {
          syncViewport();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, [activeYAxes, activeXAxes, targetXAxes, targetYs, syncViewport, pressedKeys]);

  return {
    panTarget,
    isCtrlPressed,
    isShiftPressed,
    isInteracting,
    zoomBoxState,
    handleMouseDown,
    handleTouchStart,
    handleWheel,
  };
}
