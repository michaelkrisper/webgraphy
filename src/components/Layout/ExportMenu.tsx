import { FileSpreadsheet, Grid3x3, Image, Spline } from "lucide-react";
import type React from "react";
import { PopupPicker } from "../Sidebar/PopupPicker";

interface ExportMenuProps {
	onExportSVG: () => void;
	onExportPNG: () => void;
	onExportCSV: () => void;
	/** Trigger styling of the host toolbar. */
	className: string;
	iconSize: number;
}

/** The export popover, shared by the sidebar header and collapsed menu. */
export const ExportMenu: React.FC<ExportMenuProps> = ({
	onExportSVG,
	onExportPNG,
	onExportCSV,
	className,
	iconSize,
}) => (
	<PopupPicker
		options={[
			{
				value: "svg",
				icon: <Spline size={16} />,
				label: "Export as SVG (vector)",
			},
			{
				value: "png",
				icon: <Grid3x3 size={16} />,
				label: "Export as PNG (pixel)",
			},
			{
				value: "csv",
				icon: <FileSpreadsheet size={16} />,
				label: "Export visible data as CSV",
			},
		]}
		current={"" as "svg" | "png" | "csv" | ""}
		onChange={(v) => {
			if (v === "svg") onExportSVG();
			else if (v === "png") onExportPNG();
			else if (v === "csv") onExportCSV();
		}}
		popoverId="export-popover"
		renderTrigger={({ onClick, ref }) => (
			<button
				ref={ref}
				type="button"
				onClick={onClick}
				title="Export Image or Data"
				aria-label="Export Image or Data"
				className={className}
			>
				<Image size={iconSize} />
			</button>
		)}
	/>
);
