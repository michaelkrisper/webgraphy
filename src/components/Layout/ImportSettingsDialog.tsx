import { Check, ChevronDown, Clock, EyeOff, Hash, Tag } from "lucide-react";
import React, { useId, useMemo, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type {
	ColumnConfig,
	ColumnType,
	ImportSettings,
} from "../../types/import";
import { PopupPicker, type PopupPickerOption } from "../Sidebar/PopupPicker";
import { Modal } from "./Modal";
import {
	detectDelimiter,
	detectDecimalPoint,
} from "./ImportSettings/utils/detectors";
import {
	generatePreviewData,
	generateColumnConfigs,
	getPreferredXAxisColumn,
} from "./ImportSettings/utils/preview";
import "./ImportSettingsDialog.css";

const TYPE_OPTIONS_META = [
	{
		type: "numeric" as const,
		icon: Hash,
		label: "Numeric",
		description: "Imports the values as numbers",
	},
	{
		type: "date" as const,
		icon: Clock,
		label: "Date/Time",
		description: "Reads the values as dates and times",
	},
	{
		type: "categorical" as const,
		icon: Tag,
		label: "Categorical",
		description: "Imports text values as categories",
	},
	{
		type: "ignore" as const,
		icon: EyeOff,
		label: "Ignore",
		description: "Leaves the column out of the import",
	},
];

const TYPE_PICKER_OPTIONS: PopupPickerOption<ColumnType>[] =
	TYPE_OPTIONS_META.map((o) => ({
		value: o.type,
		icon: <o.icon size={14} />,
		label: o.label,
		description: o.description,
	}));

interface ImportSettingsDialogProps {
	fileName: string;
	fileContent: string; // Preview content
	/** `fileContent` covers only the start of the file. */
	previewTruncated?: boolean;
	fileType: "csv" | "json" | "excel";
	/** Used instead of auto-detection, e.g. tab for `.tsv`. */
	defaultDelimiter?: string;
	isImporting?: boolean;
	sheets?: string[];
	selectedSheet?: string;
	onSheetChange?: (sheet: string) => void;
	onConfirm: (settings: ImportSettings) => void | Promise<void>;
	onCancel: () => void;
}

export const ImportSettingsDialog: React.FC<ImportSettingsDialogProps> = ({
	fileName,
	fileContent,
	previewTruncated = false,
	fileType,
	defaultDelimiter,
	isImporting = false,
	sheets,
	selectedSheet,
	onSheetChange,
	onConfirm,
	onCancel,
}) => {
	const initialDelimiter = (content: string) =>
		defaultDelimiter ?? detectDelimiter(content, fileType);
	const [delimiter, setDelimiter] = useState<string>(() =>
		initialDelimiter(fileContent),
	);
	const [decimalPoint, setDecimalPoint] = useState<string>(() =>
		detectDecimalPoint(fileContent, initialDelimiter(fileContent)),
	);

	// Reset derived state when file content or type changes
	const [prevFileContent, setPrevFileContent] = useState(fileContent);
	const [prevFileType, setPrevFileType] = useState(fileType);

	if (fileContent !== prevFileContent || fileType !== prevFileType) {
		setPrevFileContent(fileContent);
		setPrevFileType(fileType);
		const d = initialDelimiter(fileContent);
		setDelimiter(d);
		setDecimalPoint(detectDecimalPoint(fileContent, d));
	}
	const [startRow, setStartRow] = useState<number>(1);
	const [commentChar, setCommentChar] = useState<string>("#");
	const hintId = useId();
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

	// The typed fields re-parse the preview once typing pauses (200 ms), not
	// per keystroke. The delimiter is a select: it applies at once, together
	// with the decimal point detected for it.
	const debouncedStartRow = useDebouncedValue(startRow, 200);
	const debouncedCommentChar = useDebouncedValue(commentChar, 200);

	const previewData = useMemo(
		() =>
			generatePreviewData(
				fileContent,
				fileType,
				delimiter,
				debouncedStartRow,
				debouncedCommentChar,
				previewTruncated,
			),
		[
			fileContent,
			fileType,
			delimiter,
			debouncedStartRow,
			debouncedCommentChar,
			previewTruncated,
		],
	);

	// Derived column configs: auto-detected type + user overrides (keyed by column name)
	const columnConfigs = useMemo<ColumnConfig[]>(
		() =>
			generateColumnConfigs(previewData, columnOverrides, decimalPoint, fileType),
		[previewData, columnOverrides, decimalPoint, fileType],
	);

	// Derived X axis column: user override if still valid, otherwise auto-select date col or first col
	const xAxisColumn = useMemo(
		() => getPreferredXAxisColumn(columnConfigs, xAxisColumnOverride),
		[columnConfigs, xAxisColumnOverride],
	);

	const handleUpdateColumn = (index: number, updates: Partial<ColumnConfig>) => {
		setColumnOverrides((prev) => ({
			...prev,
			[index]: { ...prev[index], ...updates },
		}));
	};

	const footer = (
		<>
			<button
				type="button"
				disabled={isImporting}
				onClick={onCancel}
				className="modal-btn"
				aria-description="Closes the dialog without importing the file"
			>
				Cancel
			</button>
			<button
				type="button"
				disabled={isImporting}
				aria-busy={isImporting}
				aria-description="Imports the file with these settings as a new data source"
				onClick={() =>
					onConfirm({
						delimiter,
						decimalPoint,
						// What the preview (and so columnConfigs) was parsed with.
						startRow: debouncedStartRow,
						commentChar: debouncedCommentChar,
						columnConfigs,
						xAxisColumn,
						splitByColumns: splitByColumns.filter((name) =>
							columnConfigs.some((c) => c.name === name && c.type === "categorical"),
						),
					})
				}
				className="modal-btn modal-btn--primary"
			>
				{isImporting ? (
					<>
						<span className="calc-spinner" aria-hidden="true" /> Importing…
					</>
				) : (
					<>
						<Check size={16} /> Import Data
					</>
				)}
			</button>
		</>
	);

	return (
		<Modal
			onClose={onCancel}
			title={fileName}
			maxWidth="96vw"
			width="96vw"
			height="92vh"
			maxHeight="92vh"
			padding="0"
			footer={footer}
			closeDisabled={isImporting}
			describedBy={hintId}
		>
			<div className="isd-body">
				<div className="isd-general-fields">
					<div className="isd-fields-main">
						{fileType === "excel" && sheets && sheets.length > 1 && (
							<div className="isd-field-group-md">
								<label htmlFor="import-sheet" className="isd-field-label">
									Sheet:
								</label>
								<select
									id="import-sheet"
									aria-description="Workbook sheet to import; the preview follows it"
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
									aria-description="Character between the values of a row; changing it re-detects the decimal point"
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
									aria-description="Character before the fractional digits of numbers"
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
									Header Row:
								</label>
								<input
									id="import-start-row"
									type="number"
									min="1"
									title="Row with the column names; rows above it are skipped"
									value={startRow}
									onChange={(e) => setStartRow(parseInt(e.target.value, 10) || 1)}
									className="isd-input"
								/>
							</div>
						)}
						{fileType === "csv" && (
							<div className="isd-field-group-sm">
								<label htmlFor="import-comment-char" className="isd-field-label">
									Comment:
								</label>
								<input
									id="import-comment-char"
									aria-description="Lines starting with this character are skipped"
									type="text"
									maxLength={1}
									value={commentChar}
									onChange={(e) => setCommentChar(e.target.value)}
									className="isd-input"
									placeholder="#"
								/>
							</div>
						)}
						<p
							id={hintId}
							style={{
								margin: "0 0 0 auto",
								fontSize: "0.8rem",
								color: "var(--text-muted-color)",
							}}
						>
							Click a column header to use it as the X axis.
						</p>
					</div>
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
														? `${config.name} (X axis)`
														: `Click to use ${config.name} as the X axis`
												}
												className={`isd-col-name-btn${xAxisColumn === config.name ? " isd-col-name-btn--xaxis" : ""}`}
												aria-pressed={xAxisColumn === config.name}
												aria-description={
													xAxisColumn === config.name
														? "Used as the X axis of the imported data"
														: "Uses this column as the X axis"
												}
											>
												{config.name}
											</button>
											{(() => {
												const meta =
													TYPE_OPTIONS_META.find((o) => o.type === config.type) ||
													TYPE_OPTIONS_META[0];
												const Icon = meta.icon;
												return (
													<PopupPicker
														options={TYPE_PICKER_OPTIONS}
														current={config.type}
														onChange={(v) => handleUpdateColumn(i, { type: v })}
														popoverId={`col-type-popover-${i}`}
														label={`Type of ${config.name}`}
														renderTrigger={({ onClick, ref, popupProps }) => (
															<button
																ref={ref}
																type="button"
																onClick={onClick}
																title={`Type: ${meta.label}`}
																className="isd-type-btn-trigger"
																aria-description={`Type of column ${config.name}. Opens the column types`}
																{...popupProps}
															>
																<Icon size={12} />
																<span className="isd-type-btn-label">{meta.label}</span>
																<ChevronDown size={12} className="isd-type-btn-chevron" />
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
													aria-description="Pattern of the date values, e.g. YYYY-MM-DD; detected from the data"
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
														aria-description="Imports one dataset per distinct value of this column"
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
												rowIndex % 2 === 0 ? "isd-data-row-even" : "isd-data-row-odd"
											}${
												previewData.gapStart !== null && rowIndex === previewData.gapStart
													? " isd-row--gap-first-tail"
													: ""
											}`}
										>
											<td
												className="isd-td isd-rownum-cell"
												data-gap-label={
													previewData.gapStart !== null && rowIndex === previewData.gapStart
														? `${previewData.totalRows - 50} more rows`
														: undefined
												}
											>
												{previewData.gapStart !== null && rowIndex >= previewData.gapStart
													? previewData.totalRows - (previewData.rows.length - rowIndex) + 1
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
															config.type === "ignore" ? "var(--bg3)" : undefined,
														opacity: config.type === "ignore" ? 0.6 : 1,
														maxWidth: "120px",
														overflow: "hidden",
														textOverflow: "ellipsis",
													}}
												>
													{fileType === "json"
														? (row as Record<string, string>)[previewData.headers[colIndex]]
														: (row as string[])[colIndex]}
												</td>
											))}
										</tr>
									</React.Fragment>
								))}
								{previewTruncated && (
									<tr>
										<td
											colSpan={columnConfigs.length + 1}
											className="isd-td"
											style={{ color: "var(--text-light)", fontStyle: "italic" }}
										>
											Preview shows the first {previewData.rows.length} rows; the whole
											file will be imported.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</Modal>
	);
};
