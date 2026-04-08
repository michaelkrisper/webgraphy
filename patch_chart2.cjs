const fs = require('fs');

let code = fs.readFileSync('src/components/Plot/ChartContainer.tsx', 'utf8');

// 1. activeYAxes.forEach
code = code.replace(
  /activeYAxes\.forEach\(axis => \{\n\s*const axisSeries = state\.series\.filter\(s => s\.yAxisId === axis\.id\);/g,
  `const seriesByYAxisIdLocal = new Map<string, typeof state.series>();
      state.series.forEach(s => {
        if (!seriesByYAxisIdLocal.has(s.yAxisId)) seriesByYAxisIdLocal.set(s.yAxisId, []);
        seriesByYAxisIdLocal.get(s.yAxisId)!.push(s);
      });
      activeYAxes.forEach(axis => {
        const axisSeries = seriesByYAxisIdLocal.get(axis.id) || [];`
);

// 2. handleAutoScaleY
code = code.replace(
  /const axisSeries = state\.series\.filter\(s => s\.yAxisId === axisId\); if \(axisSeries\.length === 0\) return;/g,
  `const axisSeries = [];
    for(let i=0; i<state.series.length; i++) {
      if (state.series[i].yAxisId === axisId) axisSeries.push(state.series[i]);
    }
    if (axisSeries.length === 0) return;`
);

// 3. handleAutoScaleX
code = code.replace(
  /axesToScale\.forEach\(id => \{\n\s*const activeDatasetsUsingAxis = state\.datasets\.filter\(d =>\n\s*\(d\.xAxisId \|\| 'axis-1'\) === id && state\.series\.some\(s => s\.sourceId === d\.id\)\n\s*\);/g,
  `const activeDatasetIds = new Set(state.series.map(s => s.sourceId));
    axesToScale.forEach(id => {
      const activeDatasetsUsingAxis = state.datasets.filter(d =>
        (d.xAxisId || 'axis-1') === id && activeDatasetIds.has(d.id)
      );`
);

// 4. xAxesLayout
code = code.replace(
  /return activeXAxesUsed\.map\(axis => \{\n\s*const range = axis\.max - axis\.min;\n\s*const isXDate = axis\.xMode === 'date';\n\s*const datasetsForThisAxis = datasets\.filter\(d => \(d\.xAxisId \|\| 'axis-1'\) === axis\.id && series\.some\(s => s\.sourceId === d\.id\)\);\n\s*const seriesForThisAxis = series\.filter\(s => datasetsForThisAxis\.some\(d => d\.id === s\.sourceId\)\);/g,
  `const activeDatasetIds = new Set(series.map(s => s.sourceId));
    const datasetsByXAxis: Record<string, Dataset[]> = {};
    const datasetToXAxis: Record<string, string> = {};

    for(let i = 0; i < datasets.length; i++) {
      const d = datasets[i];
      if (activeDatasetIds.has(d.id)) {
        const axisId = d.xAxisId || 'axis-1';
        datasetToXAxis[d.id] = axisId;
        if (!datasetsByXAxis[axisId]) datasetsByXAxis[axisId] = [];
        datasetsByXAxis[axisId].push(d);
      }
    }

    const seriesByXAxis: Record<string, SeriesConfig[]> = {};
    for(let i = 0; i < series.length; i++) {
      const s = series[i];
      const axisId = datasetToXAxis[s.sourceId];
      if (axisId) {
        if (!seriesByXAxis[axisId]) seriesByXAxis[axisId] = [];
        seriesByXAxis[axisId].push(s);
      }
    }

    return activeXAxesUsed.map(axis => {
      const range = axis.max - axis.min;
      const isXDate = axis.xMode === 'date';
      const datasetsForThisAxis = datasetsByXAxis[axis.id] || [];
      const seriesForThisAxis = seriesByXAxis[axis.id] || [];`
);

fs.writeFileSync('src/components/Plot/ChartContainer.tsx', code);
