interface CSVParserState {
  lineCount: number;
  actualRowCount: number;
  capacity: number;
  numActive: number;
  activeCols: number[];
  finalHeaders: string[];
  configsByIndex: (any | undefined)[];
  data: Float64Array[];
  categoricalMaps: Map<string, number>[];
  isFirstLine: boolean;
}
