// src/hooks/usePanZoom.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { screenToWorld } from '../utils/coords';
import { useGraphStore } from '../store/useGraphStore';
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
  startAnimation: () => void;
  xAxesMetrics: Array<{ id: string; height: number; cumulativeOffset: number }>;
  axisLayout: Record<string, { total: number; label: number }>;
  leftAxes: YAxisConfig[];
  rightAxes: YAxisConfig[];
  handleAutoScaleX: (xAxisId?: string) => void;
  handleAutoScaleY: (axisId: string, mouseY?: number) => void;
}

interface UsePanZoomResult {
  panTarget: PanTarget | null;
  isCtrlPressed: boolean;
  isShiftPressed: boolean;
  zoomBoxState: { startX: number; startY: number; endX: number; endY: number } | null;
  isPanningRef: React.MutableRefObject<boolean>;
  pressedKeys: React.MutableRefObject<Set<string>>;
  hoveredAxisIdRef: React.MutableRefObject<string | null>;
  hoveredXAxisIdRef: React.MutableRefObject<string | null>;
  handleMouseDown: (e: React.MouseEvent, target?: PanTarget) => void;
  handleTouchStart: (e: React.TouchEvent, target?: PanTarget) => void;
  handleWheel: (e: React.WheelEvent, target?: PanTarget) => void;
}

export function usePanZoom({
  containerRef, width, height, padding, chartWidth, chartHeight,
  activeXAxes, activeYAxes, xAxesById, yAxesById,
  targetXAxes, targetYs, startAnimation,
  xAxesMetrics, axisLayout, leftAxes, rightAxes,
  handleAutoScaleX, handleAutoScaleY,
}: UsePanZoomOptions): UsePanZoomResult {
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [zoomBoxState, setZoomBoxState] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const lastTouchTime = useRef<number>(0);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const zoomBoxStartRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const isPanningRef = useRef(false);
  const pressedKeys = useRef<Set<string>>(new Set());
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
      const axesToZoom = (target === 'all' || shiftKey) ? activeXAxes : [xAxesById.get((target as { xAxisId: string }).xAxisId)!];
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
      const axesToZoom = target === 'all' ? activeYAxes : [yAxesById.get((target as { yAxisId: string }).yAxisId)!];
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
    startAnimation();
  }, [activeXAxes, activeYAxes, xAxesById, yAxesById, width, height, padding, chartWidth, chartHeight, targetXAxes, targetYs, startAnimation]);

  const performPan = useCallback((dx: number, dy: number, target: PanTarget = 'all', shiftKey = false) => {
    const state = useGraphStore.getState();
    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const axes = (target === 'all' || shiftKey) ? activeXAxes : [xAxesById.get(((target as { xAxisId: string }).xAxisId))!];
      axes.forEach(axis => {
        if (!axis) return;
        const xr = axis.max - axis.min;
        const xm = chartWidth > 0 ? (dx / chartWidth) * xr : 0;
        const next = { min: axis.min - xm, max: axis.max - xm };
        state.updateXAxis(axis.id, next);
        targetXAxes.current[axis.id] = next;
      });
    }
    const draggedY = typeof target === 'object' && 'yAxisId' in target ? target.yAxisId : null;
    const yAxesToPan = (target === 'all' && !shiftKey) ? activeYAxes : (draggedY ? [yAxesById.get(draggedY)!] : []);
    yAxesToPan.forEach(axis => {
      if (!axis) return;
      const cur = yAxesById.get(axis.id)!;
      const yr = cur.max - cur.min;
      const ym = chartHeight > 0 ? (dy / chartHeight) * yr : 0;
      const next = { min: cur.min + ym, max: cur.max + ym };
      state.updateYAxis(axis.id, next);
      targetYs.current[axis.id] = next;
    });
  }, [activeXAxes, activeYAxes, xAxesById, yAxesById, chartWidth, chartHeight, targetXAxes, targetYs]);

  const handleWheel = useCallback((e: React.WheelEvent, target: PanTarget = 'all') => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const rect = containerRef.current?.getBoundingClientRect();
    performZoom(zoomFactor, rect ? e.clientX - rect.left : width / 2, rect ? e.clientY - rect.top : height / 2, target, e.shiftKey);
  }, [containerRef, width, height, performZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent, target: PanTarget = 'all') => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (e.ctrlKey && target === 'all') {
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        const box = { startX: x, startY: y, endX: x, endY: y };
        zoomBoxStartRef.current = box;
        setZoomBoxState(box);
      }
    } else {
      isPanningRef.current = true;
      setPanTarget(target);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  }, [containerRef, padding, width, height]);

  const handleTouchStart = useCallback((e: React.TouchEvent, target: PanTarget = 'all') => {
    const now = Date.now(), isDouble = now - lastTouchTime.current < 300;
    lastTouchTime.current = now;
    if (e.touches.length === 1) {
      const t = e.touches[0], rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (isDouble) {
        if (target === 'all') { handleAutoScaleX(); activeYAxes.forEach(a => handleAutoScaleY(a.id)); }
        else if (typeof target === 'object') {
          if ('xAxisId' in target) handleAutoScaleX(target.xAxisId);
          else if ('yAxisId' in target) handleAutoScaleY(target.yAxisId, t.clientY - rect.top);
        }
        return;
      }
      isPanningRef.current = true;
      setPanTarget(target);
      lastTouchPos.current = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) {
      isPanningRef.current = false;
      setPanTarget(prev => (prev && prev !== 'all') ? prev : target);
      const t1 = e.touches[0], t2 = e.touches[1];
      lastPinchDist.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
  }, [containerRef, activeYAxes, handleAutoScaleX, handleAutoScaleY]);

  // Raw event listeners (non-React for passive:false touch)
  const panTargetRef = useRef(panTarget);
  panTargetRef.current = panTarget;
  const isShiftPressedRef = useRef(isShiftPressed);
  isShiftPressedRef.current = isShiftPressed;

  useEffect(() => {
    const handleTouchMoveRaw = (e: TouchEvent) => {
      const target = panTargetRef.current;
      if (e.touches.length === 1 && target && lastTouchPos.current) {
        if (e.cancelable) e.preventDefault();
        const t = e.touches[0], dx = t.clientX - lastTouchPos.current.x, dy = t.clientY - lastTouchPos.current.y;
        lastTouchPos.current = { x: t.clientX, y: t.clientY };
        performPan(dx, dy, target, e.shiftKey);
      } else if (e.touches.length === 2 && lastPinchDist.current) {
        if (e.cancelable) e.preventDefault();
        const rect = containerRef.current!.getBoundingClientRect();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (dist === 0) return;
        const zf = lastPinchDist.current / dist;
        lastPinchDist.current = dist;
        performZoom(zf, (t1.clientX + t2.clientX) / 2 - rect.left, (t1.clientY + t2.clientY) / 2 - rect.top, target || 'all', e.shiftKey);
      }
    };

    const handleMouseMoveRaw = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
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
      performPan(e.clientX - lastMousePos.current.x, e.clientY - lastMousePos.current.y, target, e.shiftKey);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
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
          startAnimation();
        }
      }
      isPanningRef.current = false;
      setPanTarget(null);
    };

    const handleTouchEnd = () => {
      isPanningRef.current = false;
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
  }, [containerRef, padding, width, height, activeXAxes, activeYAxes, targetXAxes, targetYs, startAnimation, performPan, performZoom, getHoveredYAxis, getHoveredXAxis]);

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
        const step = 0.15;
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          const axes = (hoveredXAxisIdRef.current && !e.shiftKey) ? activeXAxes.filter(a => a.id === hoveredXAxisIdRef.current) : activeXAxes;
          axes.forEach(a => {
            const t = targetXAxes.current[a.id] || { min: a.min, max: a.max };
            const r = t.max - t.min, d = e.key === 'ArrowLeft' ? -1 : 1;
            targetXAxes.current[a.id] = { min: t.min + d * r * step, max: t.max + d * r * step };
          });
          startAnimation();
        } else if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
          const axes = hoveredAxisIdRef.current ? activeYAxes.filter(a => a.id === hoveredAxisIdRef.current) : activeYAxes;
          const d = (hoveredAxisIdRef.current ? -1 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          axes.forEach(a => {
            const t = targetYs.current[a.id] || { min: a.min, max: a.max };
            const r = t.max - t.min;
            targetYs.current[a.id] = { min: t.min + d * r * step, max: t.max + d * r * step };
          });
          startAnimation();
        } else if (['+', '-'].includes(e.key)) {
          startAnimation();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, [activeYAxes, activeXAxes, targetXAxes, targetYs, startAnimation]);

  return {
    panTarget,
    isCtrlPressed,
    isShiftPressed,
    zoomBoxState,
    isPanningRef,
    pressedKeys,
    hoveredAxisIdRef,
    hoveredXAxisIdRef,
    handleMouseDown,
    handleTouchStart,
    handleWheel,
  };
}
