import { useGraphStore } from '../store/useGraphStore';

const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

export const applyKeyboardZoom = (
  state: ReturnType<typeof useGraphStore.getState>,
  keys: Set<string>,
  targetXAxes: Record<string, { min: number, max: number }>,
  targetYs: Record<string, { min: number, max: number }>
) => {
  if (keys.has('+') || keys.has('=') || keys.has('-') || keys.has('_')) {
    const isCtrl = keys.has('Control');
    const zoomFactor = (keys.has('+') || keys.has('=')) ? 0.85 : 1.15;

    state.xAxes.forEach(axis => {
      const t = targetXAxes[axis.id] || { min: axis.min, max: axis.max };
      const xRange = t.max - t.min;
      const newXRange = xRange * zoomFactor;
      targetXAxes[axis.id] = { min: t.min + (xRange - newXRange) / 2, max: t.max - (xRange - newXRange) / 2 };
    });

    if (!isCtrl) {
      state.yAxes.forEach(axis => {
        const t = targetYs[axis.id] || { min: axis.min, max: axis.max };
        const yRange = t.max - t.min;
        const newYRange = yRange * zoomFactor;
        targetYs[axis.id] = { min: t.min + (yRange - newYRange) / 2, max: t.max - (yRange - newYRange) / 2 };
      });
    }
    return true;
  }
  return false;
};

export const animateXAxes = (
  state: ReturnType<typeof useGraphStore.getState>,
  targetXAxes: Record<string, { min: number, max: number }>,
  factor: number
) => {
  let needsNextFrame = false;
  state.xAxes.forEach(axis => {
    const target = targetXAxes[axis.id];
    if (!target) return;
    const xRange = Math.abs(axis.max - axis.min);
    const xEps = xRange * 0.0001 || 0.0001;
    const nextXMin = lerp(axis.min, target.min, factor);
    const nextXMax = lerp(axis.max, target.max, factor);

    if (Math.abs(nextXMin - axis.min) > xEps || Math.abs(nextXMax - axis.max) > xEps) {
      state.updateXAxis(axis.id, { min: nextXMin, max: nextXMax });
      needsNextFrame = true;
    } else if (axis.min !== target.min || axis.max !== target.max) {
      state.updateXAxis(axis.id, { min: target.min, max: target.max });
    }
  });
  return needsNextFrame;
};

export const animateYAxes = (
  state: ReturnType<typeof useGraphStore.getState>,
  targetYs: Record<string, { min: number, max: number }>,
  factor: number
) => {
  let needsNextFrame = false;
  state.yAxes.forEach(axis => {
    const target = targetYs[axis.id];
    if (!target) return;
    const yRange = Math.abs(axis.max - axis.min);
    const yEps = yRange * 0.0001 || 0.0001;
    const nextYMin = lerp(axis.min, target.min, factor);
    const nextYMax = lerp(axis.max, target.max, factor);

    if (Math.abs(nextYMin - axis.min) > yEps || Math.abs(nextYMax - axis.max) > yEps) {
      state.updateYAxis(axis.id, { min: nextYMin, max: nextYMax });
      needsNextFrame = true;
    } else if (axis.min !== target.min || axis.max !== target.max) {
      state.updateYAxis(axis.id, { min: target.min, max: target.max });
    }
  });
  return needsNextFrame;
};
