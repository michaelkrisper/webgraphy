import {
	FileSpreadsheet,
	FolderOpen,
	Grid3x3,
	Image,
	ImageDown,
	Save,
	Spline,
} from "lucide-react";
import type React from "react";
import { PopupPicker, type PopupPickerOption } from "../Sidebar/PopupPicker";

interface ExportMenuProps {
	/** Opens the export options dialog. */
	onExportImage: () => void;
	onExportSVG: () => void;
	onExportPNG: () => void;
	onExportCSV: () => void;
	/** With both session handlers the menu also offers Open/Save session. */
	onOpenSession?: () => void;
	onSaveSession?: () => void;
	/** Trigger styling of the host toolbar. */
	className: string;
	iconSize: number;
}

type MenuAction = "open" | "save" | "image" | "svg" | "png" | "csv";

const SESSION_OPTIONS: PopupPickerOption<MenuAction>[] = [
	{
		value: "open",
		icon: <FolderOpen size={16} />,
		label: "Open session…",
		description: "Replaces the workspace with a saved .webgraphy session file",
	},
	{
		value: "save",
		icon: <Save size={16} />,
		label: "Save session…",
		description:
			"Downloads all datasets, series and axes as one .webgraphy session file",
	},
];

const EXPORT_OPTIONS: PopupPickerOption<MenuAction>[] = [
	{
		value: "image",
		icon: <ImageDown size={16} />,
		label: "Export image…",
		description: "Opens the export options: format, size, legend, title, theme",
	},
	{
		value: "svg",
		icon: <Spline size={16} />,
		label: "Export as SVG (vector)",
		description: "Downloads the chart at its on-screen size as a vector image",
	},
	{
		value: "png",
		icon: <Grid3x3 size={16} />,
		label: "Export as PNG (pixel)",
		description: "Downloads the chart at its on-screen size as a pixel image",
	},
	{
		value: "csv",
		icon: <FileSpreadsheet size={16} />,
		label: "Export visible data as CSV",
		description: "Downloads every row in the visible range as a CSV file",
	},
];

/** The export popover (plus sessions where offered), shared by the sidebar header and collapsed menu. */
export const ExportMenu: React.FC<ExportMenuProps> = ({
	onExportImage,
	onExportSVG,
	onExportPNG,
	onExportCSV,
	onOpenSession,
	onSaveSession,
	className,
	iconSize,
}) => {
	const withSessions = !!(onOpenSession && onSaveSession);
	const title = withSessions ? "Session & Export" : "Export Image or Data";
	return (
		<PopupPicker
			options={
				withSessions ? [...SESSION_OPTIONS, ...EXPORT_OPTIONS] : EXPORT_OPTIONS
			}
			current={"" as MenuAction | ""}
			onChange={(v) => {
				if (v === "open") onOpenSession?.();
				else if (v === "save") onSaveSession?.();
				else if (v === "image") onExportImage();
				else if (v === "svg") onExportSVG();
				else if (v === "png") onExportPNG();
				else if (v === "csv") onExportCSV();
			}}
			popoverId="export-popover"
			label={title}
			minWidth={withSessions ? 200 : undefined}
			renderTrigger={({ onClick, ref, popupProps }) => (
				<button
					ref={ref}
					type="button"
					onClick={onClick}
					title={title}
					aria-label={title}
					aria-description={
						withSessions
							? "Opens a menu to open or save a session and to export the chart or the visible data"
							: "Opens a menu to export the chart as an image or the visible data as CSV"
					}
					{...popupProps}
					className={className}
				>
					{withSessions ? <Save size={iconSize} /> : <Image size={iconSize} />}
				</button>
			)}
		/>
	);
};
