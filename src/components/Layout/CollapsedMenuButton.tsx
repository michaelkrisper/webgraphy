import type React from "react";
import type { Theme } from "../../themes";
import { ExportMenu } from "./ExportMenu";

interface CollapsedMenuButtonProps {
	onClick: () => void;
	onExportSVG: () => void;
	onExportPNG: () => void;
	onExportCSV: () => void;
	theme: Theme;
}

export const CollapsedMenuButton: React.FC<CollapsedMenuButtonProps> = ({
	onClick,
	onExportSVG,
	onExportPNG,
	onExportCSV,
}) => (
	<div className="collapsed-menu-btns">
		<button
			type="button"
			onClick={onClick}
			className="collapsed-menu-btn"
			title="Open Menu"
			aria-label="Open Menu"
		>
			<img src="./favicon.svg" alt="webgraphy logo" />
		</button>
		<ExportMenu
			onExportSVG={onExportSVG}
			onExportPNG={onExportPNG}
			onExportCSV={onExportCSV}
			className="collapsed-menu-btn"
			iconSize={18}
		/>
	</div>
);
