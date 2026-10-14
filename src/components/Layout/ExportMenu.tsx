import { Grid3x3, Image, Spline } from "lucide-react";
import type React from "react";
import { PopupPicker } from "../Sidebar/PopupPicker";

interface ExportMenuProps {
	onExportSVG: () => void;
	onExportPNG: () => void;
	/** Trigger styling of the host toolbar. */
	className: string;
	iconSize: number;
}

/** The image-export popover, shared by the sidebar header and collapsed menu. */
export const ExportMenu: React.FC<ExportMenuProps> = ({
	onExportSVG,
	onExportPNG,
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
		]}
		current={"" as "svg" | "png" | ""}
		onChange={(v) => {
			if (v === "svg") onExportSVG();
			else if (v === "png") onExportPNG();
		}}
		popoverId="export-popover"
		renderTrigger={({ onClick, ref }) => (
			<button
				ref={ref}
				type="button"
				onClick={onClick}
				title="Export Image"
				aria-label="Export Image"
				className={className}
			>
				<Image size={iconSize} />
			</button>
		)}
	/>
);
