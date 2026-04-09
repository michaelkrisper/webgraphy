const { performance } = require('perf_hooks');

const NUM_AXES = 10;
const leftAxes = Array.from({ length: NUM_AXES }, (_, i) => ({ id: `L${i}`, position: 'left' }));
const rightAxes = Array.from({ length: NUM_AXES }, (_, i) => ({ id: `R${i}`, position: 'right' }));
const yAxes = [];
for(let i=0; i<NUM_AXES; i++) {
  yAxes.push(leftAxes[i]);
  yAxes.push(rightAxes[i]);
}

const axisLayout = {};
yAxes.forEach(a => axisLayout[a.id] = { total: 40 });

const padding = { left: 20, right: 20, top: 20, bottom: 20 };
const width = 800;
const height = 600;

function baselineHover(mouseX, mouseY) {
  if (mouseY < padding.top || mouseY > height - padding.bottom) return null;
  let foundHovered = null;
  leftAxes.forEach((axis, sideIdx) => {
    let offset = 0; for (let i = 0; i < sideIdx; i++) offset += axisLayout[leftAxes[i].id]?.total || 40;
    const axisMetrics = axisLayout[axis.id] || { total: 40 };
    const leftBound = padding.left - offset - axisMetrics.total;
    const rightBound = padding.left - offset;
    if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
  });
  rightAxes.forEach((axis, sideIdx) => {
    let offset = 0; for (let i = 0; i < sideIdx; i++) offset += axisLayout[rightAxes[i].id]?.total || 40;
    const axisMetrics = axisLayout[axis.id] || { total: 40 };
    const leftBound = width - padding.right + offset;
    const rightBound = width - padding.right + offset + axisMetrics.total;
    if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
  });
  return foundHovered;
}

const yAxisOffsets = {};
let leftCumulative = 0;
for (let i = 0; i < leftAxes.length; i++) {
  yAxisOffsets[leftAxes[i].id] = leftCumulative;
  leftCumulative += axisLayout[leftAxes[i].id]?.total || 40;
}
let rightCumulative = 0;
for (let i = 0; i < rightAxes.length; i++) {
  yAxisOffsets[rightAxes[i].id] = rightCumulative;
  rightCumulative += axisLayout[rightAxes[i].id]?.total || 40;
}

function optimizedHoverWithMemoObject(mouseX, mouseY) {
  if (mouseY < padding.top || mouseY > height - padding.bottom) return null;
  let foundHovered = null;

  // Can just iterate left and right axes and look up the offset!
  for (let i = 0; i < leftAxes.length; i++) {
    const axis = leftAxes[i];
    const offset = yAxisOffsets[axis.id];
    const axisMetrics = axisLayout[axis.id] || { total: 40 };
    const leftBound = padding.left - offset - axisMetrics.total;
    const rightBound = padding.left - offset;
    if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
  }
  for (let i = 0; i < rightAxes.length; i++) {
    const axis = rightAxes[i];
    const offset = yAxisOffsets[axis.id];
    const axisMetrics = axisLayout[axis.id] || { total: 40 };
    const leftBound = width - padding.right + offset;
    const rightBound = width - padding.right + offset + axisMetrics.total;
    if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
  }
  return foundHovered;
}

let sum1 = 0, sum2 = 0;

const start1 = performance.now();
for(let i=0; i<100000; i++) sum1 += baselineHover(100, 300) ? 1 : 0;
const end1 = performance.now();

const start2 = performance.now();
for(let i=0; i<100000; i++) sum2 += optimizedHoverWithMemoObject(100, 300) ? 1 : 0;
const end2 = performance.now();

console.log(`Baseline Hover: ${(end1 - start1).toFixed(2)}ms`);
console.log(`Optimized Hover with memo object: ${(end2 - start2).toFixed(2)}ms`);
