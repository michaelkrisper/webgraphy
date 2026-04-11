export interface CSVStreamState {
  lineCount: number;
  actualRowCount: number;
  capacity: number;
  numActive: number;
  activeCols: number[];
  finalHeaders: string[];
  configsByIndex: (ColumnConfigEntry | undefined)[];
  data: Float64Array[];
  categoricalMaps: Map<string, number>[];
  isFirstLine: boolean;
}

async function processCSVStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  delimiter: string,
  startRow: number,
  columnConfigs: ColumnConfigEntry[],
  isComma: boolean,
  state: CSVStreamState
): Promise<CSVStreamState> {
  // ... refactored while loop logic
}
