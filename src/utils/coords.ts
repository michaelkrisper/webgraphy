export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
  padding?: { top: number; right: number; bottom: number; left: number };
}

export const worldToScreen = (x: number, y: number, view: Viewport) => {
  const p = view.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  const chartWidth = view.width - p.left - p.right;
  const chartHeight = view.height - p.top - p.bottom;

  const sx = p.left + ((x - view.xMin) / (view.xMax - view.xMin)) * chartWidth;
  const sy = view.height - p.bottom - ((y - view.yMin) / (view.yMax - view.yMin)) * chartHeight;
  return { x: sx, y: sy };
};

export const screenToWorld = (sx: number, sy: number, view: Viewport) => {
  const p = view.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  const chartWidth = view.width - p.left - p.right;
  const chartHeight = view.height - p.top - p.bottom;

  const x = view.xMin + ((sx - p.left) / chartWidth) * (view.xMax - view.xMin);
  const y = view.yMin + ((view.height - p.bottom - sy) / chartHeight) * (view.yMax - view.yMin);
  return { x, y };
};
