const iterations = 10000;
const viewsCount = 1000;

// Create dummy views
const views = Array.from({ length: viewsCount }, (_, i) => ({
  id: `view-${i}`,
  name: `View ${i}`
}));
views.push({ id: 'default-view', name: 'Default View' });

console.log(`Starting benchmark for ${iterations} iterations with ${viewsCount} views...`);

// Baseline (current implementation)
const startBaseline = performance.now();
for (let i = 0; i < iterations; i++) {
  // Simulating lines 365, 375, and 381 redundant filtering
  const name = `View ${views.filter(v => v.id !== 'default-view').length + 1}`;

  const hasNoViews = (!views || views.filter(v => v.id !== 'default-view').length === 0);

  const filteredViews = views.filter(v => v.id !== 'default-view');
  const mappedViews = filteredViews.map(v => v.name);
}
const endBaseline = performance.now();
console.log(`Baseline (redundant filtering): ${(endBaseline - startBaseline).toFixed(2)}ms`);

// Optimized (extract to variable)
const startOptimized = performance.now();
for (let i = 0; i < iterations; i++) {
  const customViews = views ? views.filter(v => v.id !== 'default-view') : [];

  const name = `View ${customViews.length + 1}`;

  const hasNoViews = customViews.length === 0;

  const mappedViews = customViews.map(v => v.name);
}
const endOptimized = performance.now();
console.log(`Optimized (extracted variable): ${(endOptimized - startOptimized).toFixed(2)}ms`);

const improvement = ((endBaseline - startBaseline) / (endOptimized - startOptimized)).toFixed(2);
console.log(`Improvement: ${improvement}x faster`);
