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

  let leftCumulative = 0;
  const leftOffsets = new Array(leftAxes.length);
  for (let i = 0; i < leftAxes.length; i++) {
    leftOffsets[i] = leftCumulative;
    leftCumulative += axisLayout[leftAxes[i].id]?.total || 40;
  }

  let rightCumulative = 0;
  const rightOffsets = new Array(rightAxes.length);
  for (let i = 0; i < rightAxes.length; i++) {
    rightOffsets[i] = rightCumulative;
    rightCumulative += axisLayout[rightAxes[i].id]?.total || 40;
  }

  yAxes.map((axis) => {
    const isLeft = axis.position === 'left';
    let sideIdx = 0;
    if (isLeft) {
      for(let i=0; i<leftAxes.length; i++) {
        if(leftAxes[i].id === axis.id) { sideIdx = i; break; }
      }
    } else {
      for(let i=0; i<rightAxes.length; i++) {
        if(rightAxes[i].id === axis.id) { sideIdx = i; break; }
      }
    }
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
for(let i=0; i<100000; i++) sum1 += baseline();
const end1 = performance.now();

const start2 = performance.now();
for(let i=0; i<100000; i++) sum2 += optimized();
const end2 = performance.now();

console.log(`Baseline map: ${(end1 - start1).toFixed(2)}ms`);
console.log(`Optimized inline find: ${(end2 - start2).toFixed(2)}ms`);
console.log(`Results identical: ${sum1 === sum2}`);
