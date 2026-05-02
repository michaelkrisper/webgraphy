import { useGraphStore } from '../store/useGraphStore';

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

export interface AxesFrame {
  xUpdates: Record<string, { min: number; max: number }>;
  yUpdates: Record<string, { min: number; max: number }>;
}

/**
 * Returns updates to sync axes with targets instantly (no lerp).
 */
export const syncAxesWithTargets = (
  state: ReturnType<typeof useGraphStore.getState>,
  targetXAxes: Record<string, { min: number, max: number }>,
  targetYs: Record<string, { min: number, max: number }>
): AxesFrame => {
  const xUpdates: Record<string, { min: number; max: number }> = {};
  const yUpdates: Record<string, { min: number; max: number }> = {};

  state.xAxes.forEach(axis => {
    const target = targetXAxes[axis.id];
    if (target && (axis.min !== target.min || axis.max !== target.max)) {
      xUpdates[axis.id] = { min: target.min, max: target.max };
    }
  });

  state.yAxes.forEach(axis => {
    const target = targetYs[axis.id];
    if (target && (axis.min !== target.min || axis.max !== target.max)) {
      yUpdates[axis.id] = { min: target.min, max: target.max };
    }
  });

  return { xUpdates, yUpdates };
};
