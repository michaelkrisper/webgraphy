import { FolderOpen, Grid3x3, Image, Save, Spline } from "lucide-react";
import type React from "react";
import { PopupPicker, type PopupPickerOption } from "../Sidebar/PopupPicker";

interface ExportMenuProps {
	onExportSVG: () => void;
	onExportPNG: () => void;
	/** With both session handlers the menu also offers Open/Save session. */
	onOpenSession?: () => void;
	onSaveSession?: () => void;
	/** Trigger styling of the host toolbar. */
	className: string;
	iconSize: number;
}

type MenuAction = "open" | "save" | "svg" | "png";

const SESSION_OPTIONS: PopupPickerOption<MenuAction>[] = [
	{ value: "open", icon: <FolderOpen size={16} />, label: "Open session…" },
	{ value: "save", icon: <Save size={16} />, label: "Save session…" },
];

const EXPORT_OPTIONS: PopupPickerOption<MenuAction>[] = [
	{ value: "svg", icon: <Spline size={16} />, label: "Export as SVG (vector)" },
	{ value: "png", icon: <Grid3x3 size={16} />, label: "Export as PNG (pixel)" },
];

/** The file popover (image export, plus sessions where offered), shared by the sidebar header and collapsed menu. */
export const ExportMenu: React.FC<ExportMenuProps> = ({
	onExportSVG,
	onExportPNG,
	onOpenSession,
	onSaveSession,
	className,
	iconSize,
}) => {
	const withSessions = !!(onOpenSession && onSaveSession);
	const title = withSessions ? "Session & Export" : "Export Image";
	return (
		<PopupPicker
			options={
				withSessions ? [...SESSION_OPTIONS, ...EXPORT_OPTIONS] : EXPORT_OPTIONS
			}
			current={"" as MenuAction | ""}
			onChange={(v) => {
				if (v === "open") onOpenSession?.();
				else if (v === "save") onSaveSession?.();
				else if (v === "svg") onExportSVG();
				else if (v === "png") onExportPNG();
			}}
			popoverId="export-popover"
			minWidth={withSessions ? 200 : undefined}
			renderTrigger={({ onClick, ref }) => (
				<button
					ref={ref}
					type="button"
					onClick={onClick}
					title={title}
					aria-label={title}
					className={className}
				>
					{withSessions ? <Save size={iconSize} /> : <Image size={iconSize} />}
				</button>
			)}
		/>
	);
};
