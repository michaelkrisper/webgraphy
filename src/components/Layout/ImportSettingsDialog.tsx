import { Check, ChevronDown, Clock, EyeOff, Hash, Tag, X } from "lucide-react";
import React, { useDeferredValue, useMemo, useState } from "react";
import type {
	ColumnConfig,
	ColumnType,
	ImportSettings,
} from "../../types/import";
import { PopupPicker, type PopupPickerOption } from "../Sidebar/PopupPicker";
import { Modal } from "./Modal";
import { detectDelimiter, detectDecimalPoint } from "./ImportSettings/utils/detectors";
import { generatePreviewData, generateColumnConfigs, getPreferredXAxisColumn } from "./ImportSettings/utils/preview";

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
