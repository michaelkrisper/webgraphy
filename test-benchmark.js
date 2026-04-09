import { performance } from 'perf_hooks';
import { Blob } from 'buffer';
import fs from 'fs';

// Create a large CSV file
const rowCount = 500000;
let csv = "time,value1,value2,value3\n";
for (let i = 0; i < rowCount; i++) {
  csv += `2024-01-01T12:00:00Z,${i},${i * 2},${i * 3}\n`;
}

fs.writeFileSync('large.csv', csv);
console.log('File created: large.csv', fs.statSync('large.csv').size / 1024 / 1024, 'MB');
