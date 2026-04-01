const series = [];
const yAxes = [{ id: 'y1' }, { id: 'y2' }, { id: 'y3' }];

// Generate 5000 series
for (let i = 0; i < 5000; i++) {
  series.push({
    name: `Series ${i}`,
    yColumn: `Col ${i}`,
    yAxisId: yAxes[i % 3].id,
    lineColor: '#333'
  });
}

function runOriginal() {
  const start = performance.now();
  const entries = [];
  series.forEach((s) => {
    // Simulated internal loop
    const yVal = 0; // mocked

    // The problematic code:
    const axis = yAxes.find((a) => a.id === s.yAxisId);
    const axisTitle = axis ? (series.filter((sr) => sr.yAxisId === axis.id).map((sr) => sr.name || sr.yColumn).join('/')) : '';
    const label = s.name || s.yColumn;
    const displayLabel = axisTitle && axisTitle !== label ? `${label} [${axisTitle}]` : label;
    entries.push({ label: displayLabel, value: yVal, color: s.lineColor || '#333' });
  });
  const end = performance.now();
  return end - start;
}

function runOptimized() {
  const start = performance.now();
  const entries = [];

  // The optimized code:
  const axisTitleMap = {};
  const groupedSeriesNames = {};
  series.forEach((s) => {
    if (!groupedSeriesNames[s.yAxisId]) groupedSeriesNames[s.yAxisId] = [];
    groupedSeriesNames[s.yAxisId].push(s.name || s.yColumn);
  });
  yAxes.forEach((a) => {
    if (groupedSeriesNames[a.id]) {
      axisTitleMap[a.id] = groupedSeriesNames[a.id].join('/');
    }
  });

  series.forEach((s) => {
    // Simulated internal loop
    const yVal = 0; // mocked

    const axisTitle = axisTitleMap[s.yAxisId] || '';
    const label = s.name || s.yColumn;
    const displayLabel = axisTitle && axisTitle !== label ? `${label} [${axisTitle}]` : label;
    entries.push({ label: displayLabel, value: yVal, color: s.lineColor || '#333' });
  });
  const end = performance.now();
  return end - start;
}

// Warm up
runOriginal();
runOptimized();

let originalTime = 0;
let optimizedTime = 0;
const iterations = 5;

for (let i = 0; i < iterations; i++) {
  originalTime += runOriginal();
  optimizedTime += runOptimized();
}

console.log(`Original Avg Time: ${(originalTime / iterations).toFixed(2)} ms`);
console.log(`Optimized Avg Time: ${(optimizedTime / iterations).toFixed(2)} ms`);
console.log(`Improvement: ${((originalTime - optimizedTime) / originalTime * 100).toFixed(2)}%`);
