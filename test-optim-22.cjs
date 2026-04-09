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

const padding = { left: 20, right: 20 };
const width = 800;

function baseline() {
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

function optimized() {
  let count = 0;

  const yAxisOffsets = new Map();
  let leftCumulative = 0;
  for (let i = 0; i < leftAxes.length; i++) {
    yAxisOffsets.set(leftAxes[i].id, leftCumulative);
    leftCumulative += axisLayout[leftAxes[i].id]?.total || 40;
  }
  let rightCumulative = 0;
  for (let i = 0; i < rightAxes.length; i++) {
    yAxisOffsets.set(rightAxes[i].id, rightCumulative);
    rightCumulative += axisLayout[rightAxes[i].id]?.total || 40;
  }

  yAxes.map((axis) => {
    const isLeft = axis.position === 'left';
    const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
    let xPos = 0;
    if (isLeft) {
      xPos = padding.left - yAxisOffsets.get(axis.id) - axisMetrics.total;
    } else {
      xPos = width - padding.right + yAxisOffsets.get(axis.id);
    }
    count += xPos;
  });
  return count;
}

let sum1 = 0, sum2 = 0;

const start1 = performance.now();
for(let i=0; i<100000; i++) sum1 += baseline();
const end1 = performance.now();

const start2 = performance.now();
for(let i=0; i<100000; i++) sum2 += optimized();
const end2 = performance.now();

console.log(`Baseline YAxes map: ${(end1 - start1).toFixed(2)}ms`);
console.log(`Optimized Map: ${(end2 - start2).toFixed(2)}ms`);
