const { performance } = require('perf_hooks');

const NUM_AXES = 10;
const leftAxes = Array.from({ length: NUM_AXES }, (_, i) => ({ id: `L${i}`, position: 'left' }));
const rightAxes = Array.from({ length: NUM_AXES }, (_, i) => ({ id: `R${i}`, position: 'right' }));
const yAxes = [];
for (let i = 0; i < NUM_AXES; i++) {
  yAxes.push(leftAxes[i]);
  yAxes.push(rightAxes[i]);
}

const axisLayout = {};
yAxes.forEach(a => {
  axisLayout[a.id] = { total: 40, label: 30 };
});

function baseline() {
  let count = 0;
  for (let i = 0; i < 10000; i++) {
    yAxes.map((axis) => {
      const isLeft = axis.position === 'left', sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
      const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
      let xPos = 0;
      if (isLeft) {
        let offset = 0; for(let j=0; j<sideIdx; j++) offset += axisLayout[leftAxes[j].id]?.total || 40;
        xPos = 100 - offset - axisMetrics.total;
      } else {
        let offset = 0; for(let j=0; j<sideIdx; j++) offset += axisLayout[rightAxes[j].id]?.total || 40;
        xPos = 500 + offset;
      }
      count += xPos;
    });
  }
  return count;
}

function optimized() {
  let count = 0;
  for (let i = 0; i < 10000; i++) {
    let leftOffset = 0;
    let rightOffset = 0;
    yAxes.map((axis) => {
      const isLeft = axis.position === 'left';
      const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
      let xPos = 0;
      if (isLeft) {
        xPos = 100 - leftOffset - axisMetrics.total;
        leftOffset += axisMetrics.total;
      } else {
        xPos = 500 + rightOffset;
        rightOffset += axisMetrics.total;
      }
      count += xPos;
    });
  }
  return count;
}

const start1 = performance.now();
baseline();
const end1 = performance.now();

const start2 = performance.now();
optimized();
const end2 = performance.now();

console.log(`Baseline: ${(end1 - start1).toFixed(2)}ms`);
console.log(`Optimized: ${(end2 - start2).toFixed(2)}ms`);
