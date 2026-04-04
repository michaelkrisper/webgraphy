import { performance } from 'perf_hooks';

const numDatasets = 1000;
const numSeries = 10000;

interface Dataset {
    id: string;
    data: Record<string, unknown>;
}

interface Series {
    sourceId: string;
}

const datasets: Dataset[] = [];
for (let i = 0; i < numDatasets; i++) {
    datasets.push({ id: `ds-${i}`, data: {} });
}

const axisSeries: Series[] = [];
for (let i = 0; i < numSeries; i++) {
    axisSeries.push({ sourceId: `ds-${Math.floor(Math.random() * numDatasets)}` });
}

function runBaseline() {
    let count = 0;
    axisSeries.forEach(s => {
        const ds = datasets.find(d => d.id === s.sourceId);
        if (ds) count++;
    });
    return count;
}

function runOptimized() {
    let count = 0;
    const datasetMap = new Map<string, Dataset>();
    datasets.forEach(d => datasetMap.set(d.id, d));

    axisSeries.forEach(s => {
        const ds = datasetMap.get(s.sourceId);
        if (ds) count++;
    });
    return count;
}

const t0 = performance.now();
runBaseline();
const t1 = performance.now();
console.log(`Baseline: ${t1 - t0}ms`);

const t2 = performance.now();
runOptimized();
const t3 = performance.now();
console.log(`Optimized: ${t3 - t2}ms`);
