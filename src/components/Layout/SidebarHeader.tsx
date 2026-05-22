import {
	Cat,
	Columns3,
	Crosshair,
	FilePlus,
	FlaskConical,
	Grid3x3,
	Image,
	List,
	Moon,
	PanelRightClose,
	Spline,
	Sun,
	Terminal,
} from "lucide-react";
import type React from "react";
import { useGraphStore } from "../../store/useGraphStore";
import { useTheme } from "../../hooks/useTheme";
import { THEME_CYCLE, type ThemeName } from "../../themes";
import { PopupPicker, type PopupPickerOption } from "../Sidebar/PopupPicker";

const UnicornHeadIcon = ({ size = 24 }: { size?: number }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<title>Unicorn Head Icon</title>
		<path d="m15.6 4.8 2.7 2.3" />
		<path d="M15.5 10S19 7 22 2c-6 2-10 5-10 5" />
		<path d="M11.5 12H11" />
		<path d="M5 15a4 4 0 0 0 4 4h7.8l.3.3a3 3 0 0 0 4-4.46L12 7c0-3-1-5-1-5S8 3 8 7c-4 1-6 3-6 3" />
		<path d="M2 4.5C4 3 6 3 6 3l2 4" />
		<path d="M6.14 17.8S4 19 2 22" />
	</svg>
);

const THEME_ICONS: Record<ThemeName, React.ReactNode> = {
	light: <Sun size={24} />,
	dark: <Moon size={24} />,
	matrix: <Terminal size={24} />,
	winnie: <Cat size={24} />,
	unicorn: <UnicornHeadIcon size={24} />,
};

const THEME_POPUP_ICONS: Record<ThemeName, React.ReactNode> = {
	light: <Sun size={16} />,
	dark: <Moon size={16} />,
	matrix: <Terminal size={16} />,
	winnie: <Cat size={16} />,
	unicorn: <UnicornHeadIcon size={16} />,
};

const THEME_LABELS: Record<ThemeName, string> = {
	light: "Light",
	dark: "Dark",
	matrix: "Matrix",
	winnie: "Winnie",
	unicorn: "Unicorn",
};

const THEME_PICKER_OPTIONS: PopupPickerOption<ThemeName>[] = THEME_CYCLE.map(
	(t) => ({
		value: t,
		icon: THEME_POPUP_ICONS[t],
		label: THEME_LABELS[t],
	}),
);

const HeaderButton = ({
	onClick,
	icon,
	title,
	color,
	off,
}: {
	onClick: () => void;
	icon: React.ReactNode;
	title: string;
	color?: string;
	off?: boolean;
}) => (
	<button
		type="button"
		onClick={onClick}
		title={title}
		className={off ? "sb-hdr-btn sb-hdr-btn--off" : "sb-hdr-btn"}
		style={color ? { color } : undefined}
	>
		{icon}
	</button>
);

interface SidebarHeaderProps {
	onCollapse: () => void;
	onImport: () => void;
	onExportSVG: () => void;
	onExportPNG: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
	onCollapse,
	onImport,
	onExportSVG,
	onExportPNG,
}) => {
	const loadDemoData = useGraphStore((s) => s.loadDemoData);
	const updateXAxis = useGraphStore((s) => s.updateXAxis);
	const xAxes = useGraphStore((s) => s.xAxes);
	const legendVisible = useGraphStore((s) => s.legendVisible);
	const setLegendVisible = useGraphStore((s) => s.setLegendVisible);
	const crosshairVisible = useGraphStore((s) => s.crosshairVisible);
	const setCrosshairVisible = useGraphStore((s) => s.setCrosshairVisible);
	const [themeName, , setTheme] = useTheme();

	const hdrSep = <span className="sb-hdr-sep" />;

	return (
		<header className="sb-header">
			<button
				type="button"
				className="sb-logo-btn"
				onClick={onCollapse}
				aria-label="Collapse Sidebar"
			>
				<img src="./favicon.svg" className="sb-logo" alt="webgraphy logo" />
			</button>
			<HeaderButton
				onClick={onImport}
				icon={<FilePlus size={24} />}
				title="Import Data Source"
			/>
			<div className="sb-hdr-btns">
				<HeaderButton
					onClick={loadDemoData}
					icon={<FlaskConical size={24} />}
					title="Load Demo Data"
				/>
				{hdrSep}
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
							className="sb-hdr-btn"
						>
							<Image size={24} />
						</button>
					)}
				/>
				{hdrSep}
				<span className="sb-spacer" />
				<HeaderButton
					onClick={() => {
						const ax = xAxes[0];
						if (ax) updateXAxis(ax.id, { showGrid: !ax.showGrid });
					}}
					icon={<Columns3 size={24} />}
					title={
						xAxes[0]?.showGrid ? "Hide Vertical Grid" : "Show Vertical Grid"
					}
					off={!xAxes[0]?.showGrid}
				/>
				<HeaderButton
					onClick={() => setCrosshairVisible(!crosshairVisible)}
					icon={<Crosshair size={24} />}
					title={crosshairVisible ? "Hide Crosshair" : "Show Crosshair"}
					off={!crosshairVisible}
				/>
				<HeaderButton
					onClick={() => setLegendVisible(!legendVisible)}
					icon={<List size={24} />}
					title={legendVisible ? "Hide Legend" : "Show Legend"}
					off={!legendVisible}
				/>
				<PopupPicker
					options={THEME_PICKER_OPTIONS}
					current={themeName}
					onChange={setTheme}
					popoverId="theme-popover"
					renderTrigger={({ onClick, ref }) => (
						<button
							ref={ref}
							type="button"
							onClick={onClick}
							title={THEME_LABELS[themeName]}
							className="sb-hdr-btn"
						>
							{THEME_ICONS[themeName]}
						</button>
					)}
				/>
				{hdrSep}
				<HeaderButton
					onClick={onCollapse}
					icon={<PanelRightClose size={24} />}
					title="Collapse Sidebar"
				/>
			</div>
		</header>
	);
};
