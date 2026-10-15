import type React from "react";
import { useId, useState } from "react";
import {
	effectiveUnit,
	type ImageExportOptions,
	type LegendPosition,
	loadExportOptions,
	MAX_DPI,
	MIN_DPI,
	PNG_SCALES,
	type PngScale,
	resolveExportSize,
	SIZE_PRESETS,
	type SizePresetId,
	type SizeUnit,
	saveExportOptions,
	validateExportOptions,
} from "../../services/exportOptions";
import { Modal } from "./Modal";
import "./ExportImageDialog.css";

const LEGEND_POSITIONS: { value: LegendPosition; label: string }[] = [
	{ value: "auto", label: "Auto" },
	{ value: "top-right", label: "Top right" },
	{ value: "top-left", label: "Top left" },
	{ value: "bottom-right", label: "Bottom right" },
	{ value: "bottom-left", label: "Bottom left" },
	{ value: "outside-right", label: "Outside right" },
];

interface ExportImageDialogProps {
	/** On-screen plot size, used by the "Current view" preset. */
	viewSize: { width: number; height: number };
	onExport: (options: ImageExportOptions) => void;
	onClose: () => void;
}

const outputSummary = (
	options: ImageExportOptions,
	view: { width: number; height: number },
) => {
	const size = resolveExportSize(options, view);
	if (options.format === "svg") {
		return size.physical
			? `${size.physical.widthMm} × ${size.physical.heightMm} mm, vector`
			: `${size.width} × ${size.height} px, vector`;
	}
	const px = `${size.pixelWidth} × ${size.pixelHeight} px`;
	return size.physical ? `${px} at ${options.dpi} dpi` : px;
};

/** Size, legend, title and background choices for an SVG or PNG export. */
export const ExportImageDialog: React.FC<ExportImageDialogProps> = ({
	viewSize,
	onExport,
	onClose,
}) => {
	const [options, setOptions] = useState(loadExportOptions);
	const id = useId();
	const formId = `${id}-form`;
	const set = <K extends keyof ImageExportOptions>(
		key: K,
		value: ImageExportOptions[K],
	) => setOptions((o) => ({ ...o, [key]: value }));

	const unit = effectiveUnit(options);
	const isPng = options.format === "png";
	const error = validateExportOptions(options, viewSize);

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		if (error) return;
		saveExportOptions(options);
		onClose();
		onExport(options);
	};

	const formatRadio = (value: ImageExportOptions["format"], label: string) => (
		<label className="xid-radio">
			<input
				type="radio"
				name={`${id}-format`}
				value={value}
				checked={options.format === value}
				onChange={() => set("format", value)}
				data-autofocus={options.format === value ? "" : undefined}
			/>
			{label}
		</label>
	);

	return (
		<Modal
			onClose={onClose}
			title="Export Image"
			maxWidth="460px"
			footer={
				<>
					<button type="button" className="modal-btn" onClick={onClose}>
						Cancel
					</button>
					<button
						type="submit"
						form={formId}
						className="modal-btn modal-btn--primary"
						disabled={!!error}
					>
						Export
					</button>
				</>
			}
		>
			<form id={formId} className="xid-grid" onSubmit={submit} noValidate>
				<span className="xid-label" id={`${id}-format-label`}>
					Format
				</span>
				<div
					className="xid-row"
					role="radiogroup"
					aria-labelledby={`${id}-format-label`}
				>
					{formatRadio("svg", "SVG (vector)")}
					{formatRadio("png", "PNG (pixel)")}
				</div>

				<label className="xid-label" htmlFor={`${id}-size`}>
					Size
				</label>
				<select
					id={`${id}-size`}
					className="calc-input"
					value={options.preset}
					onChange={(e) => set("preset", e.target.value as SizePresetId)}
				>
					{SIZE_PRESETS.map((p) => (
						<option key={p.id} value={p.id}>
							{p.id === "view"
								? `${p.label} (${viewSize.width} × ${viewSize.height} px)`
								: p.label}
						</option>
					))}
				</select>

				{options.preset === "custom" && (
					<>
						<span className="xid-label" id={`${id}-custom-label`}>
							Width × height
						</span>
						<div className="xid-row">
							<input
								type="number"
								className="calc-input xid-number"
								aria-label="Width"
								aria-describedby={`${id}-custom-label`}
								min={1}
								value={Number.isFinite(options.customWidth) ? options.customWidth : ""}
								onChange={(e) => set("customWidth", e.target.valueAsNumber)}
							/>
							<span aria-hidden="true">×</span>
							<input
								type="number"
								className="calc-input xid-number"
								aria-label="Height"
								aria-describedby={`${id}-custom-label`}
								min={1}
								value={
									Number.isFinite(options.customHeight) ? options.customHeight : ""
								}
								onChange={(e) => set("customHeight", e.target.valueAsNumber)}
							/>
							<select
								className="calc-input xid-unit"
								aria-label="Unit"
								value={options.customUnit}
								onChange={(e) => set("customUnit", e.target.value as SizeUnit)}
							>
								<option value="px">px</option>
								<option value="mm">mm</option>
							</select>
						</div>
					</>
				)}

				{isPng && unit === "mm" && (
					<>
						<label className="xid-label" htmlFor={`${id}-dpi`}>
							Resolution
						</label>
						<div className="xid-row">
							<input
								id={`${id}-dpi`}
								type="number"
								className="calc-input xid-number"
								min={MIN_DPI}
								max={MAX_DPI}
								value={Number.isFinite(options.dpi) ? options.dpi : ""}
								onChange={(e) => set("dpi", e.target.valueAsNumber)}
							/>
							<span>dpi</span>
						</div>
					</>
				)}

				{isPng && unit === "px" && (
					<>
						<label className="xid-label" htmlFor={`${id}-scale`}>
							Scale
						</label>
						<select
							id={`${id}-scale`}
							className="calc-input"
							value={options.scale}
							onChange={(e) => set("scale", Number(e.target.value) as PngScale)}
						>
							{PNG_SCALES.map((s) => (
								<option key={s} value={s}>
									{s}×
								</option>
							))}
						</select>
					</>
				)}

				<span className="xid-label">Output</span>
				<output className="xid-output" aria-live="polite">
					{error ? (
						<span className="xid-error" role="alert">
							{error}
						</span>
					) : (
						outputSummary(options, viewSize)
					)}
				</output>

				<span className="xid-label">Legend</span>
				<div className="xid-row">
					<label className="xid-check">
						<input
							type="checkbox"
							aria-label="Include legend"
							checked={options.legend}
							onChange={(e) => set("legend", e.target.checked)}
						/>
						Include
					</label>
					<select
						className="calc-input"
						aria-label="Legend position"
						value={options.legendPosition}
						disabled={!options.legend}
						onChange={(e) => set("legendPosition", e.target.value as LegendPosition)}
					>
						{LEGEND_POSITIONS.map((p) => (
							<option key={p.value} value={p.value}>
								{p.label}
							</option>
						))}
					</select>
				</div>

				<label className="xid-label" htmlFor={`${id}-title`}>
					Title
				</label>
				<input
					id={`${id}-title`}
					type="text"
					className="calc-input"
					placeholder="None"
					maxLength={500}
					value={options.title}
					onChange={(e) => set("title", e.target.value)}
				/>

				<span className="xid-label">Background</span>
				<label className="xid-check">
					<input
						type="checkbox"
						aria-label="Transparent background"
						checked={options.transparent}
						onChange={(e) => set("transparent", e.target.checked)}
					/>
					Transparent
				</label>
			</form>
		</Modal>
	);
};
