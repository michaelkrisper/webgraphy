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

// And the map/yAxes test again to see if we can optimize it using Maps or pre-computed Arrays.
function baselineYAxes() {
  let count = 0;
  yAxes.map((axis) => {
    const isLeft = axis.position === 'left', sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
    const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
    let xPos = 0;
    if (isLeft) {
      let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[leftAxes[i].id]?.total || 40;
      xPos = padding.left - offset - axisMetrics.total;
    } else {
      let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[rightAxes[i].id]?.total || 40;
      xPos = width - padding.right + offset;
    }
    count += xPos;
  });
  return count;
}

function optimizedYAxes() {
  let count = 0;

  const leftOffsets = new Array(leftAxes.length);
  let leftCumulative = 0;
  for (let i = 0; i < leftAxes.length; i++) {
    leftOffsets[i] = leftCumulative;
    leftCumulative += axisLayout[leftAxes[i].id]?.total || 40;
  }

  const rightOffsets = new Array(rightAxes.length);
  let rightCumulative = 0;
  for (let i = 0; i < rightAxes.length; i++) {
    rightOffsets[i] = rightCumulative;
    rightCumulative += axisLayout[rightAxes[i].id]?.total || 40;
  }

  yAxes.map((axis) => {
    const isLeft = axis.position === 'left', sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
    const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
    let xPos = 0;
    if (isLeft) {
      xPos = padding.left - leftOffsets[sideIdx] - axisMetrics.total;
    } else {
      xPos = width - padding.right + rightOffsets[sideIdx];
    }
    count += xPos;
  });
  return count;
}


let sum1 = 0, sum2 = 0;

const start1 = performance.now();
for(let i=0; i<100000; i++) sum1 += baselineYAxes();
const end1 = performance.now();

const start2 = performance.now();
for(let i=0; i<100000; i++) sum2 += optimizedYAxes();
const end2 = performance.now();

console.log(`Baseline YAxes map: ${(end1 - start1).toFixed(2)}ms`);
console.log(`Optimized YAxes map: ${(end2 - start2).toFixed(2)}ms`);
