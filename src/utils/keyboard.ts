// src/utils/keyboard.ts
import { useGraphStore } from '../store/useGraphStore';

export const applyKeyboardPan = (
  state: ReturnType<typeof useGraphStore.getState>,
  keys: Set<string>,
  targetXAxes: Record<string, { min: number, max: number }>,
  targetYs: Record<string, { min: number, max: number }>
) => {
  const left = keys.has('ArrowLeft'), right = keys.has('ArrowRight');
  const up = keys.has('ArrowUp'), down = keys.has('ArrowDown');
  if (!left && !right && !up && !down) return false;

  const step = 0.07;
  if (left || right) {
    const d = right ? 1 : -1;
    state.xAxes.forEach(axis => {
      const t = targetXAxes[axis.id] || { min: axis.min, max: axis.max };
      const r = t.max - t.min;
      targetXAxes[axis.id] = { min: t.min + d * r * step, max: t.max + d * r * step };
    });
  }
  if (up || down) {
    const d = up ? 1 : -1;
    state.yAxes.forEach(axis => {
      const t = targetYs[axis.id] || { min: axis.min, max: axis.max };
      const r = t.max - t.min;
      targetYs[axis.id] = { min: t.min + d * r * step, max: t.max + d * r * step };
    });
  }
  return true;
};

/**
 * Applies zooming based on pressed keys (+/-).
 * Returns true if a zoom update was triggered.
 */
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
