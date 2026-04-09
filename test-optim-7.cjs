const { performance } = require('perf_hooks');

const NUM_AXES = 10;
const leftAxes = Array.from({ length: NUM_AXES }, (_, i) => ({ id: `L${i}`, position: 'left' }));
const rightAxes = Array.from({ length: NUM_AXES }, (_, i) => ({ id: `R${i}`, position: 'right' }));

const axisLayout = {};
leftAxes.forEach(a => axisLayout[a.id] = { total: 40 });
rightAxes.forEach(a => axisLayout[a.id] = { total: 40 });

const padding = { left: 20, right: 20, top: 20, bottom: 20 };
const width = 800;
const height = 600;

function baseline(mouseX, mouseY) {
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

function optimized(mouseX, mouseY) {
  if (mouseY < padding.top || mouseY > height - padding.bottom) return null;
  let foundHovered = null;

  let leftOffset = 0;
  for (let i = 0; i < leftAxes.length; i++) {
    const axis = leftAxes[i];
    const axisMetrics = axisLayout[axis.id] || { total: 40 };
    const leftBound = padding.left - leftOffset - axisMetrics.total;
    const rightBound = padding.left - leftOffset;
    if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
    leftOffset += axisMetrics.total;
  }

  let rightOffset = 0;
  for (let i = 0; i < rightAxes.length; i++) {
    const axis = rightAxes[i];
    const axisMetrics = axisLayout[axis.id] || { total: 40 };
    const leftBound = width - padding.right + rightOffset;
    const rightBound = width - padding.right + rightOffset + axisMetrics.total;
    if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
    rightOffset += axisMetrics.total;
  }

  return foundHovered;
}

let sum1 = 0, sum2 = 0;

const start1 = performance.now();
for(let i=0; i<100000; i++) sum1 += baseline(100, 300) ? 1 : 0;
const end1 = performance.now();

const start2 = performance.now();
for(let i=0; i<100000; i++) sum2 += optimized(100, 300) ? 1 : 0;
const end2 = performance.now();

console.log(`Baseline: ${(end1 - start1).toFixed(2)}ms`);
console.log(`Optimized (Inline accumulate): ${(end2 - start2).toFixed(2)}ms`);
console.log(`Results identical: ${sum1 === sum2}`);
