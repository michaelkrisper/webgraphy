import type React from "react";
import { useMemo, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { THEMES } from "../../themes";
import { IMPORT_FILE_ACCEPT } from "../../types/import";

interface EmptyStateProps {
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	onImportFile?: (file: File) => void;
	onLoadDemo?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
	width,
	height,
	padding,
	onImportFile,
	onLoadDemo,
}) => {
	const [themeName] = useTheme();
	const t = THEMES[themeName];
	const fileInputRef = useRef<HTMLInputElement>(null);
	const buttonStyle: React.CSSProperties = {
		padding: "8px 16px",
		border: `1px solid ${t.accent}`,
		fontWeight: 600,
	};

	const chartWidth = width - padding.left - padding.right;
	const chartHeight = height - padding.top - padding.bottom;

	const backgroundSvg = useMemo(() => {
		const gridSpacingX = chartWidth / 10;
		const gridSpacingY = chartHeight / 6;

		// Grid lines
		let gridPaths = "";
		for (let x = 0; x <= chartWidth; x += gridSpacingX) {
			gridPaths += `M ${x} 0 L ${x} ${chartHeight} `;
		}
		for (let y = 0; y <= chartHeight; y += gridSpacingY) {
			gridPaths += `M 0 ${y} L ${chartWidth} ${y} `;
		}

		// Wellen
		const waveColors = [t.accent, t.gridColor, t.textMuted];
		const offsets = [0, chartHeight * 0.15, -chartHeight * 0.15];
		let wavePaths = "";

		for (let i = 0; i < 3; i++) {
			let wavePath = "";
			const noiseSeed = (i * 12.34) % 100;

			for (let x = 0; x <= chartWidth; x++) {
				const noise = Math.sin(x * 0.005 + noiseSeed) * 10;
				const y =
					chartHeight / 2 +
					offsets[i] +
					Math.sin(x * 0.005 + i * 2) * (80 + i * 20) +
					noise;
				wavePath += `${x === 0 ? "M" : "L"} ${x} ${y} `;
			}
			wavePaths += `<path d="${wavePath}" stroke="${waveColors[i]}" stroke-width="2" fill="none"/>`;
		}

		const svg = `
			<svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg">
				<path d="${gridPaths}" stroke="${t.gridColor}" stroke-width="1" fill="none"/>
				<path d="M 0 0 L 0 ${chartHeight} L ${chartWidth} ${chartHeight}" stroke="${t.axisColor}" stroke-width="2" fill="none"/>
				${wavePaths}
			</svg>
		`;
		return `data:image/svg+xml;base64,${btoa(svg)}`;
	}, [t, chartWidth, chartHeight]);

	return (
		<div
			style={{
				position: "absolute",
				left: padding.left,
				top: padding.top,
				width: chartWidth,
				height: chartHeight,
				overflow: "hidden",
				zIndex: 2,
				backgroundColor: t.bg2,
				backgroundImage: `url("${backgroundSvg}")`,
				backgroundRepeat: "no-repeat",
				backgroundSize: "100% 100%",
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					pointerEvents: "none",
				}}
			>
				<div
					style={{
						textAlign: "center",
						background: "rgba(0,0,0,0.03)",
						padding: "20px 40px",
						borderRadius: "12px",
						backdropFilter: "blur(10px)",
						border: "1px solid rgba(255, 255, 255, 0.2)",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "10px",
						pointerEvents: "auto",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
						<img
							src="favicon.svg"
							alt="logo"
							style={{ width: "48px", height: "48px" }}
						/>
						<h2
							style={{
								margin: 0,
								color: t.text,
								fontSize: "2.5rem",
								fontWeight: 300,
								letterSpacing: "0.15em",
							}}
						>
							WEBGRAPHY
						</h2>
					</div>
					<p
						style={{
							margin: 0,
							color: t.textMuted,
							fontSize: "0.95rem",
							opacity: 0.7,
							letterSpacing: "0.05em",
						}}
					>
						Visualize and explore your data
					</p>
					{(onImportFile || onLoadDemo) && (
						<div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
							{onImportFile && (
								<>
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										style={{ ...buttonStyle, background: t.accent, color: t.bg }}
									>
										Import file…
									</button>
									<input
										ref={fileInputRef}
										type="file"
										accept={IMPORT_FILE_ACCEPT}
										aria-hidden="true"
										tabIndex={-1}
										onChange={(e) => {
											const f = e.target.files?.[0];
											if (f) onImportFile(f);
											e.target.value = "";
										}}
										style={{ display: "none" }}
									/>
								</>
							)}
							{onLoadDemo && (
								<button
									type="button"
									onClick={onLoadDemo}
									style={{ ...buttonStyle, background: t.bg, color: t.text }}
								>
									Load demo data
								</button>
							)}
						</div>
					)}
					{onImportFile && (
						<p style={{ margin: 0, color: t.textMuted, fontSize: "0.85rem" }}>
							or drop a file anywhere
						</p>
					)}
				</div>
			</div>
		</div>
	);
};
