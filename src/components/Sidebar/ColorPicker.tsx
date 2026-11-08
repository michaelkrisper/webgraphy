import type React from "react";
import { useEffect, useRef, useState } from "react";
import { COLOR_PALETTE } from "../../themes";
import { hexToRgb, lchToRgb, rgbToHex, rgbToLch } from "../../utils/colors";

interface ColorPickerProps {
	color: string;
	/** A swatch was clicked. */
	onSelect: (color: string) => void;
	/** The hex or RGB fields hold a new, complete colour. */
	onChange: (color: string) => void;
	onHover?: (color: string) => void;
	onHoverEnd?: () => void;
}

const LCH_LIGHTNESS_STEPS = [22, 38, 54, 68, 82];

interface ColorPaletteButtonProps {
	targetColor: string;
	currentColor: string;
	onSelect: (color: string) => void;
	onHoverColor: (color: string) => void;
	onHoverLeave: () => void;
}

function ColorPaletteButton({
	targetColor,
	currentColor,
	onSelect,
	onHoverColor,
	onHoverLeave,
}: ColorPaletteButtonProps) {
	return (
		<button
			type="button"
			onClick={() => onSelect(targetColor)}
			onMouseEnter={() => onHoverColor(targetColor)}
			onMouseLeave={onHoverLeave}
			className="color-picker-palette-btn"
			aria-label={`Color ${targetColor}`}
			aria-description="Applies this color and closes the popup; hovering previews it"
			aria-pressed={currentColor.toLowerCase() === targetColor.toLowerCase()}
			style={{
				backgroundColor: targetColor,
				border:
					currentColor.toLowerCase() === targetColor.toLowerCase()
						? "2px solid var(--text)"
						: "none",
			}}
		/>
	);
}

interface ColorPickerGridProps {
	color: string;
	onSelect: (color: string) => void;
	onHoverColor: (color: string) => void;
	onHoverLeave: () => void;
}

function ColorPickerGrid({
	color,
	onSelect,
	onHoverColor,
	onHoverLeave,
}: ColorPickerGridProps) {
	return (
		<div className="color-picker-grid-vertical">
			{/* Grayscale Column */}
			<div className="color-picker-column">
				<div className="color-picker-main-color">
					<ColorPaletteButton
						targetColor="#000000"
						currentColor={color}
						onSelect={onSelect}
						onHoverColor={onHoverColor}
						onHoverLeave={onHoverLeave}
					/>
				</div>
				<div className="color-picker-grid-spacer" />
				<div className="color-picker-shades">
					{LCH_LIGHTNESS_STEPS.map((l) => {
						const rgbVal = lchToRgb(l, 0, 0);
						const hexVal = rgbToHex(rgbVal.r, rgbVal.g, rgbVal.b);
						return (
							<ColorPaletteButton
								key={hexVal}
								targetColor={hexVal}
								currentColor={color}
								onSelect={onSelect}
								onHoverColor={onHoverColor}
								onHoverLeave={onHoverLeave}
							/>
						);
					})}
				</div>
			</div>

			{/* Theme Color Columns */}
			{COLOR_PALETTE.map((themeColor) => {
				const rgbTheme = hexToRgb(themeColor);
				const lchTheme = rgbToLch(rgbTheme.r, rgbTheme.g, rgbTheme.b);
				return (
					<div key={themeColor} className="color-picker-column">
						<div className="color-picker-main-color">
							<ColorPaletteButton
								targetColor={themeColor}
								currentColor={color}
								onSelect={onSelect}
								onHoverColor={onHoverColor}
								onHoverLeave={onHoverLeave}
							/>
						</div>
						<div className="color-picker-grid-spacer" />
						<div className="color-picker-shades">
							{LCH_LIGHTNESS_STEPS.map((l) => {
								const rgbVal = lchToRgb(l, lchTheme.C, lchTheme.h);
								const hexVal = rgbToHex(rgbVal.r, rgbVal.g, rgbVal.b);
								return (
									<ColorPaletteButton
										key={hexVal}
										targetColor={hexVal}
										currentColor={color}
										onSelect={onSelect}
										onHoverColor={onHoverColor}
										onHoverLeave={onHoverLeave}
									/>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

const RGB_LABELS = { r: "Red", g: "Green", b: "Blue" } as const;

interface ColorPickerInputsProps {
	color: string;
	hoverColor: string | null;
	localHex: string;
	setLocalHex: (hex: string) => void;
	onChange: (color: string) => void;
}

function ColorPickerInputs({
	color,
	hoverColor,
	localHex,
	setLocalHex,
	onChange,
}: ColorPickerInputsProps) {
	const rgbInputsRef = useRef<HTMLDivElement>(null);
	const displayColor = hoverColor ?? color;
	const displayHex = hoverColor ?? localHex;
	const { r, g, b } = hexToRgb(displayColor);

	const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setLocalHex(val);
		if (/^#[0-9A-F]{6}$/i.test(val)) onChange(val.toLowerCase());
	};

	const handleRgbChange = (part: "r" | "g" | "b", input: HTMLInputElement) => {
		const n = parseInt(input.value, 10);
		// Cleared or half-typed: keep the colour, so the field can be retyped;
		// leaving it restores the value.
		if (Number.isNaN(n)) return;
		const v = Math.min(255, Math.max(0, n));
		// Preact does not re-render when the clamped value is the one the
		// colour already has (300 on a channel at 255), so the field would keep
		// showing what was typed.
		if (v !== n) input.value = String(v);
		const newRgb = { r, g, b, [part]: v };
		onChange(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
	};

	const rgbRef = useRef({ r, g, b });

	useEffect(() => {
		rgbRef.current = { r, g, b };
	}, [r, g, b]);

	useEffect(() => {
		const el = rgbInputsRef.current;
		if (!el) return;
		const handler = (e: WheelEvent) => {
			const input = (e.target as HTMLElement).closest("input");
			if (!input) return;
			const inputs = Array.from(el.querySelectorAll("input"));
			const idx = inputs.indexOf(input as HTMLInputElement);
			const parts = ["r", "g", "b"] as const;
			if (idx === -1) return;
			e.preventDefault();
			const part = parts[idx];
			const current = rgbRef.current;
			const delta = e.deltaY < 0 ? 1 : -1;
			const newVal = Math.min(255, Math.max(0, current[part] + delta));
			const newRgb = { ...current, [part]: newVal };
			onChange(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
		};
		el.addEventListener("wheel", handler, { passive: false });
		return () => el.removeEventListener("wheel", handler);
	}, [onChange]);

	return (
		<div className="color-picker-inputs">
			<div className="color-picker-input-group">
				<input
					type="text"
					value={displayHex}
					onChange={handleHexChange}
					className="color-picker-input"
					aria-label="Hex color value"
					aria-description="Six hex digits after #, applied once complete"
					spellCheck={false}
				/>
			</div>
			<div className="color-picker-input-group">
				<span className="color-picker-label">RGB</span>
				<div className="color-picker-rgb-inputs" ref={rgbInputsRef}>
					{(["r", "g", "b"] as const).map((p) => {
						const value = p === "r" ? r : p === "g" ? g : b;
						return (
							<input
								key={p}
								type="number"
								min={0}
								max={255}
								value={value}
								onChange={(e) => handleRgbChange(p, e.currentTarget)}
								onBlur={(e) => {
									e.currentTarget.value = String(value);
								}}
								className="color-picker-input"
								aria-label={RGB_LABELS[p]}
								aria-description={`${RGB_LABELS[p]} channel from 0 to 255; the mouse wheel steps it by 1`}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/** Swatches plus hex and RGB fields, the colour part of the style popup. */
function ColorPicker({
	color,
	onSelect,
	onChange,
	onHover,
	onHoverEnd,
}: ColorPickerProps) {
	const [localHex, setLocalHex] = useState(color);
	const [prevColor, setPrevColor] = useState(color);
	const [hoverColor, setHoverColor] = useState<string | null>(null);

	if (color !== prevColor) {
		setPrevColor(color);
		setLocalHex(color);
	}

	const handleColorHover = (hoveredColor: string) => {
		onHover?.(hoveredColor);
		setHoverColor(hoveredColor);
	};

	const handleColorHoverLeave = () => {
		onHoverEnd?.();
		setHoverColor(null);
	};

	return (
		<div className="color-picker-panel">
			<ColorPickerGrid
				color={color}
				onSelect={onSelect}
				onHoverColor={handleColorHover}
				onHoverLeave={handleColorHoverLeave}
			/>
			<ColorPickerInputs
				color={color}
				hoverColor={hoverColor}
				localHex={localHex}
				setLocalHex={setLocalHex}
				onChange={onChange}
			/>
		</div>
	);
}

export default ColorPicker;
