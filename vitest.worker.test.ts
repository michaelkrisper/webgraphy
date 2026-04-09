import { test } from 'vitest';
import fs from 'fs';

test('benchmark stream vs text', async () => {
  const blob = new Blob([fs.readFileSync('large.csv')]);
  const file = blob as any as File; // mock File

  console.time('text');
  const text = await file.text();
  const lines = text.split('\n');
  let rowCount = 0;
  for (const line of lines) {
    if (line) rowCount++;
  }
  console.timeEnd('text');
  console.log('rowCount', rowCount);

  console.time('chunked');
  const chunkSize = 1024 * 1024; // 1MB
  let offset = 0;
  let partial = '';
  let rowCount2 = 0;
  while (offset < file.size) {
    const chunk = await file.slice(offset, offset + chunkSize).text();
    offset += chunkSize;

    const lines = (partial + chunk).split('\n');
    partial = lines.pop() || '';

    for (const line of lines) {
      if (line) rowCount2++;
    }
  }
  if (partial) rowCount2++;
  console.timeEnd('chunked');
  console.log('rowCount2', rowCount2);
});
