import { Grid3x3, Spline } from "lucide-react";
import type React from "react";
import type { Theme } from "../../themes";

interface CollapsedMenuButtonProps {
	onClick: () => void;
	onExportSVG: () => void;
	onExportPNG: () => void;
	theme: Theme;
}

// Icons and wording match the expanded sidebar's export menu.
export const CollapsedMenuButton: React.FC<CollapsedMenuButtonProps> = ({
	onClick,
	onExportSVG,
	onExportPNG,
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
		<button
			type="button"
			onClick={onExportSVG}
			className="collapsed-menu-btn"
			title="Export as SVG (vector)"
			aria-label="Export SVG"
		>
			<Spline size={18} />
		</button>
		<button
			type="button"
			onClick={onExportPNG}
			className="collapsed-menu-btn"
			title="Export as PNG (pixel)"
			aria-label="Export PNG"
		>
			<Grid3x3 size={18} />
		</button>
	</div>
);
