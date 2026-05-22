import { Check, ChevronDown, Clock, EyeOff, Hash, Tag, X } from "lucide-react";
import React, { useDeferredValue, useMemo, useState } from "react";
import type {
	ColumnConfig,
	ColumnType,
	ImportSettings,
} from "../../types/import";
import { splitCSVLine } from "../../utils/data-parser";
import { secureJSONParse } from "../../utils/json";
import { PopupPicker, type PopupPickerOption } from "../Sidebar/PopupPicker";
import { Modal } from "./Modal";

const TYPE_OPTIONS_META = [
	{ type: "numeric" as const, icon: Hash, label: "Numeric" },
	{ type: "date" as const, icon: Clock, label: "Date/Time" },
	{ type: "categorical" as const, icon: Tag, label: "Categorical" },
	{ type: "ignore" as const, icon: EyeOff, label: "Ignore" },
];

const TYPE_PICKER_OPTIONS: PopupPickerOption<ColumnType>[] =
	TYPE_OPTIONS_META.map((o) => ({
		value: o.type,
		icon: <o.icon size={14} />,
		label: o.label,
	}));

interface ImportSettingsDialogProps {
	fileName: string;
	fileContent: string; // Preview content
	fileType: "csv" | "json" | "excel";
	sheets?: string[];
	selectedSheet?: string;
	onSheetChange?: (sheet: string) => void;
	onConfirm: (settings: ImportSettings) => void | Promise<void>;
	onCancel: () => void;
}

function calculateDelimiterScore(lines: string[], delimiter: string): number {
	let totalCount = 0;
	const counts = new Map<number, number>();
	let maxConsistency = 0;

	for (const line of lines) {
		const count = line.split(delimiter).length - 1;
		totalCount += count;
		if (count > 0) {
			const c = (counts.get(count) || 0) + 1;
			counts.set(count, c);
			maxConsistency = Math.max(maxConsistency, c);
		}
	}

	// Score: number of lines with the most consistent non-zero count,
	// plus a small bonus for total count to break ties.
	return maxConsistency * 1000 + totalCount;
}

function detectDelimiter(
	fileContent: string,
	fileType: "csv" | "json" | "excel",
): string {
	if (fileType !== "csv" && fileType !== "excel") return ",";
	if (!fileContent) return ",";

	const lines = fileContent
		.split(/\r?\n/)
		.slice(0, 100)
		.filter((l) => l.trim());
	if (lines.length === 0) return ",";

	const candidates = [",", ";", "\t", "|"];
	let best = ",";
	let maxScore = -1;

	for (const d of candidates) {
		const score = calculateDelimiterScore(lines, d);
		if (score > maxScore) {
			maxScore = score;
			best = d;
		}
	}
	return best;
}

function detectDecimalPoint(fileContent: string, delimiter: string): string {
	if (!fileContent) return ".";
	const lines = fileContent
		.split(/\r?\n/)
		.slice(0, 100)
		.filter((l) => l.trim());
	let dotCount = 0;
	let commaCount = 0;

	const dotRegex = /\d\.\d/g;
	const commaRegex = /\d,\d/g;

	for (const line of lines) {
		const fields = line.split(delimiter);
		for (const field of fields) {
			dotCount += (field.match(dotRegex) || []).length;
			commaCount += (field.match(commaRegex) || []).length;
		}
	}

	return commaCount > dotCount ? "," : ".";
}

function detectColumnTypeAndFormat(
	firstVal: string | undefined,
	decimalPoint: string,
): { type: ColumnType; dateFormat?: string } {
	if (!firstVal || firstVal.trim() === "") {
		return { type: "ignore" };
	}

	let type: ColumnType = "numeric";
	let dateFormat: string | undefined;

	const normalized = firstVal.replace(decimalPoint, ".");
	if (Number.isNaN(Number(normalized)) || normalized.split(".").length > 2) {
		if (
			firstVal.includes("-") ||
			firstVal.includes(".") ||
			firstVal.includes("/")
		) {
			type = "date";
			if (firstVal.match(/^\d{4}-\d{2}-\d{2}$/)) dateFormat = "YYYY-MM-DD";
			else if (firstVal.match(/^\d{2}\.\d{2}\.\d{4}$/))
				dateFormat = "DD.MM.YYYY";
			else if (firstVal.match(/^\d{2}\/\d{2}\/\d{4}$/))
				dateFormat = "DD/MM/YYYY";
		} else {
			type = "categorical";
		}
	}
	return { type, dateFormat };
}

export interface PreviewData {
	headers: string[];
	rows: Record<string, string>[] | string[][];
	skippedLines: string[];
	gapStart: number | null;
	totalRows: number;
}

function generatePreviewData(
	fileContent: string,
	fileType: "csv" | "json" | "excel",
	delimiter: string,
	startRow: number,
	commentChar: string,
): PreviewData {
	const HEAD = 25;
	const TAIL = 25;
	const trim = <T,>(
		arr: T[],
	): { rows: T[]; gapStart: number | null; totalRows: number } => {
		if (arr.length <= HEAD + TAIL) {
			return { rows: arr, gapStart: null, totalRows: arr.length };
		}
		return {
			rows: [...arr.slice(0, HEAD), ...arr.slice(-TAIL)],
			gapStart: HEAD,
			totalRows: arr.length,
		};
	};

	if (fileType === "json") {
		try {
			const parsed = secureJSONParse(fileContent) as unknown;
			const allRows = (Array.isArray(parsed) ? parsed : [parsed]) as Record<
				string,
				string
			>[];
			const headers = Object.keys(
				(allRows[0] as Record<string, unknown>) || {},
			);
			const { rows, gapStart, totalRows } = trim(allRows);
			return {
				headers,
				rows,
				skippedLines: [],
				gapStart,
				totalRows,
			};
		} catch {
			return {
				headers: [],
				rows: [],
				skippedLines: [],
				gapStart: null,
				totalRows: 0,
			};
		}
	}

	const allLines = fileContent.split(/\r?\n/).filter((l) => l.trim());
	const lines = allLines.filter((l) => {
		const trimmed = l.trim();
		return commentChar ? !trimmed.startsWith(commentChar) : true;
	});

	if (lines.length === 0) {
		return {
			headers: [],
			rows: [],
			skippedLines: [],
			gapStart: null,
			totalRows: 0,
		};
	}

	const headerRowIndex = Math.max(0, startRow - 1);
	const skippedLines = lines.slice(0, headerRowIndex);
	const headerLine = lines[headerRowIndex] || "";
	const headers = splitCSVLine(headerLine, delimiter).map((h) =>
		h.trim().replace(/^"|"$/g, ""),
	);
	const allDataLines = lines.slice(headerRowIndex + 1);
	const { rows: keptLines, gapStart, totalRows } = trim(allDataLines);
	const rows = keptLines.map((line) =>
		splitCSVLine(line, delimiter).map((v) => v.trim().replace(/^"|"$/g, "")),
	);

	return { headers, rows, skippedLines, gapStart, totalRows };
}

function generateColumnConfigs(
	previewData: PreviewData,
	columnOverrides: Record<number, Partial<ColumnConfig>>,
	decimalPoint: string,
	fileType: "csv" | "json" | "excel",
): ColumnConfig[] {
	return previewData.headers.map((name, index) => {
		const override = columnOverrides[index];

		const firstVal =
			fileType === "json"
				? (previewData.rows as Record<string, string>[]).find(
						(row) => row[name],
					)?.[name]
				: (previewData.rows as string[][])[0]?.[index];

		const { type: autoType, dateFormat: autoFormat } =
			detectColumnTypeAndFormat(firstVal, decimalPoint);

		if (override) {
			return {
				index,
				name,
				type: override.type || autoType,
				dateFormat: override.dateFormat || autoFormat,
				...override,
			};
		}

		return { index, name, type: autoType, dateFormat: autoFormat };
	});
}

function getPreferredXAxisColumn(
	columnConfigs: ColumnConfig[],
	xAxisColumnOverride: string | null,
): string {
	const nonIgnored = columnConfigs.filter((c) => c.type !== "ignore");
	if (
		xAxisColumnOverride &&
		nonIgnored.some((c) => c.name === xAxisColumnOverride)
	) {
		return xAxisColumnOverride;
	}
	return (
		nonIgnored.find((c) => c.type === "date")?.name || nonIgnored[0]?.name || ""
	);
}

export const ImportSettingsDialog: React.FC<ImportSettingsDialogProps> = ({
	fileName,
	fileContent,
	fileType,
	sheets,
	selectedSheet,
	onSheetChange,
	onConfirm,
	onCancel,
}) => {
	const [delimiter, setDelimiter] = useState<string>(() =>
		detectDelimiter(fileContent, fileType),
	);
	const [decimalPoint, setDecimalPoint] = useState<string>(() =>
		detectDecimalPoint(fileContent, detectDelimiter(fileContent, fileType)),
	);

	// Reset derived state when file content or type changes
	const [prevFileContent, setPrevFileContent] = useState(fileContent);
	const [prevFileType, setPrevFileType] = useState(fileType);

	if (fileContent !== prevFileContent || fileType !== prevFileType) {
		setPrevFileContent(fileContent);
		setPrevFileType(fileType);
		const d = detectDelimiter(fileContent, fileType);
		setDelimiter(d);
		setDecimalPoint(detectDecimalPoint(fileContent, d));
	}
	const [startRow, setStartRow] = useState<number>(1);
	const [commentChar, setCommentChar] = useState<string>("#");
	// Stores per-column user overrides, keyed by column index
	const [columnOverrides, setColumnOverrides] = useState<
		Record<number, Partial<ColumnConfig>>
	>({});
	// null = auto-select best X axis column
	const [xAxisColumnOverride, setXAxisColumnOverride] = useState<string | null>(
		null,
	);
	// null = no split; otherwise the column name to split by
	const [splitByColumns, setSplitByColumns] = useState<string[]>([]);

	const deferredDelimiter = useDeferredValue(delimiter);
	const deferredStartRow = useDeferredValue(startRow);
	const deferredCommentChar = useDeferredValue(commentChar);

	const previewData = useMemo(
		() =>
			generatePreviewData(
				fileContent,
				fileType,
				deferredDelimiter,
				deferredStartRow,
				deferredCommentChar,
			),
		[
			fileContent,
			fileType,
			deferredDelimiter,
			deferredStartRow,
			deferredCommentChar,
		],
	);

	// Derived column configs: auto-detected type + user overrides (keyed by column name)
	const columnConfigs = useMemo<ColumnConfig[]>(
		() =>
			generateColumnConfigs(
				previewData,
				columnOverrides,
				decimalPoint,
				fileType,
			),
		[previewData, columnOverrides, decimalPoint, fileType],
	);

	// Derived X axis column: user override if still valid, otherwise auto-select date col or first col
	const xAxisColumn = useMemo(
		() => getPreferredXAxisColumn(columnConfigs, xAxisColumnOverride),
		[columnConfigs, xAxisColumnOverride],
	);

	const handleUpdateColumn = (
		index: number,
		updates: Partial<ColumnConfig>,
	) => {
		setColumnOverrides((prev) => ({
			...prev,
			[index]: { ...prev[index], ...updates },
		}));
	};

	return (
		<Modal
			onClose={onCancel}
			title=""
			hideHeader
			maxWidth="96vw"
			width="96vw"
			height="92vh"
			maxHeight="92vh"
			borderRadius="8px"
			padding="0"
		>
			<div className="isd-body">
				<div className="isd-general-fields">
					<div className="isd-fields-main">
						<div className="isd-filename">
							<span className="isd-filename-text" title={fileName}>
								{fileName}
							</span>
						</div>
						{fileType === "excel" && sheets && sheets.length > 1 && (
							<div className="isd-field-group-md">
								<label htmlFor="import-sheet" className="isd-field-label">
									Sheet:
								</label>
								<select
									id="import-sheet"
									value={selectedSheet}
									onChange={(e) => onSheetChange?.(e.target.value)}
									className="isd-select"
								>
									{sheets.map((s) => (
										<option key={s} value={s}>
											{s}
										</option>
									))}
								</select>
							</div>
						)}
						{fileType === "csv" && (
							<div className="isd-field-group-md">
								<label htmlFor="import-delimiter" className="isd-field-label">
									Delimiter:
								</label>
								<select
									id="import-delimiter"
									value={delimiter}
									onChange={(e) => {
										const newDelim = e.target.value;
										setDelimiter(newDelim);
										setDecimalPoint(detectDecimalPoint(fileContent, newDelim));
									}}
									className="isd-select"
								>
									<option value=",">Comma (,)</option>
									<option value=";">Semicolon (;)</option>
									<option value={"\t"}>Tab</option>
									<option value="|">Pipe (|)</option>
								</select>
							</div>
						)}
						{fileType !== "excel" && (
							<div className="isd-field-group-md">
								<label htmlFor="import-decimal" className="isd-field-label">
									Decimal Point:
								</label>
								<select
									id="import-decimal"
									value={decimalPoint}
									onChange={(e) => setDecimalPoint(e.target.value)}
									className="isd-select"
								>
									<option value=".">Dot (.)</option>
									<option value=",">Comma (,)</option>
								</select>
							</div>
						)}
						{fileType !== "json" && (
							<div className="isd-field-group-sm">
								<label htmlFor="import-start-row" className="isd-field-label">
									Start Row:
								</label>
								<input
									id="import-start-row"
									type="number"
									min="1"
									value={startRow}
									onChange={(e) =>
										setStartRow(parseInt(e.target.value, 10) || 1)
									}
									className="isd-input"
								/>
							</div>
						)}
						{fileType === "csv" && (
							<div className="isd-field-group-sm">
								<label
									htmlFor="import-comment-char"
									className="isd-field-label"
								>
									Comment:
								</label>
								<input
									id="import-comment-char"
									type="text"
									maxLength={1}
									value={commentChar}
									onChange={(e) => setCommentChar(e.target.value)}
									className="isd-input"
									placeholder="#"
								/>
							</div>
						)}
					</div>
					<button
						type="button"
						onClick={() =>
							onConfirm({
								delimiter,
								decimalPoint,
								startRow,
								commentChar,
								columnConfigs,
								xAxisColumn,
								splitByColumns: splitByColumns.filter((name) =>
									columnConfigs.some(
										(c) => c.name === name && c.type === "categorical",
									),
								),
							})
						}
						className="isd-btn-confirm"
					>
						<Check size={16} /> Import Data
					</button>
					<button
						type="button"
						onClick={onCancel}
						className="isd-btn-cancel"
						aria-label="Close dialog"
						title="Cancel"
					>
						<X size={20} />
					</button>
				</div>

				{previewData.skippedLines.length > 0 && (
					<div className="isd-skipped-lines">
						{previewData.skippedLines.map((line, i) => (
							<div key={i} className="isd-skipped-line">
								<span className="isd-skipped-line-num">{i + 1}</span>
								<span className="isd-skipped-line-text">{line}</span>
							</div>
						))}
					</div>
				)}
				<div className="isd-table-wrap">
					<div className="isd-table-scroll">
						<table className="isd-table">
							<thead>
								<tr>
									<th className="isd-col-header isd-rownum-col">#</th>
									{columnConfigs.map((config, i) => (
										<th
											key={i}
											className={`isd-col-header${xAxisColumn === config.name ? " isd-col-header--xaxis" : ""}`}
											style={{
												borderRight:
													i < columnConfigs.length - 1
														? "1px solid var(--border-color)"
														: "none",
											}}
										>
											<button
												type="button"
												onClick={() => setXAxisColumnOverride(config.name)}
												title={
													xAxisColumn === config.name
														? `${config.name} (X-Axis)`
														: `Click to use ${config.name} as X-Axis`
												}
												className={`isd-col-name-btn${xAxisColumn === config.name ? " isd-col-name-btn--xaxis" : ""}`}
											>
												{config.name}
											</button>
											{(() => {
												const meta =
													TYPE_OPTIONS_META.find(
														(o) => o.type === config.type,
													) || TYPE_OPTIONS_META[0];
												const Icon = meta.icon;
												return (
													<PopupPicker
														options={TYPE_PICKER_OPTIONS}
														current={config.type}
														onChange={(v) => handleUpdateColumn(i, { type: v })}
														popoverId={`col-type-popover-${i}`}
														renderTrigger={({ onClick, ref }) => (
															<button
																ref={ref}
																type="button"
																onClick={onClick}
																title={`Type: ${meta.label}`}
																className="isd-type-btn-trigger"
															>
																<Icon size={12} />
																<span className="isd-type-btn-label">
																	{meta.label}
																</span>
																<ChevronDown
																	size={12}
																	className="isd-type-btn-chevron"
																/>
															</button>
														)}
													/>
												);
											})()}
											{config.type === "date" && (
												<input
													type="text"
													placeholder="YYYY-MM-DD"
													maxLength={50}
													aria-label={`Column ${i + 1} date format`}
													value={config.dateFormat || ""}
													onChange={(e) =>
														handleUpdateColumn(i, {
															dateFormat: e.target.value,
														})
													}
													className="isd-date-input"
												/>
											)}
											{config.type === "categorical" && (
												<label
													className="isd-split-by"
													title="Split file into one dataset per distinct value of this column"
												>
													<input
														type="checkbox"
														checked={splitByColumns.includes(config.name)}
														onChange={(e) =>
															setSplitByColumns((prev) =>
																e.target.checked
																	? prev.includes(config.name)
																		? prev
																		: [...prev, config.name]
																	: prev.filter((n) => n !== config.name),
															)
														}
													/>
													<span>Split by category</span>
												</label>
											)}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{previewData.rows.map((row, rowIndex) => (
									<React.Fragment key={rowIndex}>
										<tr
											className={`${
												rowIndex % 2 === 0
													? "isd-data-row-even"
													: "isd-data-row-odd"
											}${
												previewData.gapStart !== null &&
												rowIndex === previewData.gapStart
													? " isd-row--gap-first-tail"
													: ""
											}`}
										>
											<td
												className="isd-td isd-rownum-cell"
												data-gap-label={
													previewData.gapStart !== null &&
													rowIndex === previewData.gapStart
														? `${previewData.totalRows - 50} more rows`
														: undefined
												}
											>
												{previewData.gapStart !== null &&
												rowIndex >= previewData.gapStart
													? previewData.totalRows -
														(previewData.rows.length - rowIndex) +
														1
													: rowIndex + 1}
											</td>
											{columnConfigs.map((config, colIndex) => (
												<td
													key={colIndex}
													className={`isd-td${xAxisColumn === config.name ? " isd-td--xaxis" : ""}`}
													style={{
														borderRight:
															colIndex < columnConfigs.length - 1
																? "1px solid var(--border-color)"
																: "none",
														color:
															config.type === "ignore"
																? "var(--text-light)"
																: "var(--text-color)",
														backgroundColor:
															config.type === "ignore"
																? "var(--bg3)"
																: undefined,
														opacity: config.type === "ignore" ? 0.6 : 1,
														maxWidth: "120px",
														overflow: "hidden",
														textOverflow: "ellipsis",
													}}
												>
													{fileType === "json"
														? (row as Record<string, string>)[
																previewData.headers[colIndex]
															]
														: (row as string[])[colIndex]}
												</td>
											))}
										</tr>
									</React.Fragment>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</Modal>
	);
};
