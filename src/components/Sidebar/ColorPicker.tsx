import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLOR_PALETTE } from "../../themes";
import { hexToRgb, lchToRgb, rgbToHex, rgbToLch } from "../../utils/colors";

interface ColorPickerProps {
	color: string;
	onChange: (color: string) => void;
	onHover?: (color: string) => void;
	onHoverEnd?: () => void;
	ariaLabel?: string;
}

const LCH_LIGHTNESS_STEPS = [35, 50, 65, 80, 95];

function ColorPicker({
	color,
	onChange,
	onHover,
	onHoverEnd,
	ariaLabel,
}: ColorPickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [localHex, setLocalHex] = useState(color);
	const [prevColor, setPrevColor] = useState(color);
	const containerRef = useRef<HTMLDivElement>(null);
	const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0 });

	if (color !== prevColor) {
		setPrevColor(color);
		setLocalHex(color);
	}

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				const popover = document.getElementById("color-picker-popover");
				if (popover?.contains(event.target as Node)) return;
				setIsOpen(false);
				if (onHoverEnd) onHoverEnd();
			}
		};
		if (isOpen) document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen, onHoverEnd]);

	const toggleOpen = () => {
		if (!isOpen && containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect();
			const popoverWidth = 220;
			const padding = 10;
			
			let left = rect.left + window.scrollX;
			if (left + popoverWidth > window.innerWidth - padding) {
				left = rect.right + window.scrollX - popoverWidth;
			}

			setPopoverCoords({
				top: rect.bottom + window.scrollY,
				left: Math.max(padding, left),
			});
		}
		if (isOpen && onHoverEnd) onHoverEnd();
		setIsOpen(!isOpen);
	};

	const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setLocalHex(val);
		if (/^#[0-9A-F]{6}$/i.test(val)) onChange(val.toLowerCase());
	};

	const { r, g, b } = hexToRgb(color);
	const handleRgbChange = (part: "r" | "g" | "b", val: string) => {
		let n = parseInt(val, 10);
		if (Number.isNaN(n)) n = 0;
		const currentRgb = { r, g, b };
		const newRgb = { ...currentRgb, [part]: Math.min(255, n) };
		onChange(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
	};

	return (
		<div ref={containerRef} className="color-picker-wrapper">
			<button
				type="button"
				onClick={toggleOpen}
				title="Select Color"
				aria-label={ariaLabel || "Select Color"}
				className="color-picker-btn"
				style={{ backgroundColor: color }}
			/>

			{isOpen &&
				createPortal(
					<div
						id="color-picker-popover"
						className="color-picker-popover"
						style={{ top: popoverCoords.top + 4, left: popoverCoords.left }}
					>
						<div className="color-picker-grid-vertical">
							{/* Grayscale Column */}
							<div className="color-picker-column">
								<div className="color-picker-main-color">
									<button
										type="button"
										onClick={() => {
											onChange("#000000");
											if (onHoverEnd) onHoverEnd();
											setIsOpen(false);
										}}
										onMouseEnter={() => onHover?.("#000000")}
										onMouseLeave={() => onHoverEnd?.()}
										className="color-picker-palette-btn"
										style={{
											backgroundColor: "#000000",
											border: color.toLowerCase() === "#000000"
												? "2px solid var(--text)"
												: "1px solid var(--border-color)",
										}}
									/>
								</div>
								<div className="color-picker-grid-spacer" />
								<div className="color-picker-shades">
									{LCH_LIGHTNESS_STEPS.map((l) => {
										const rgbVal = lchToRgb(l, 0, 0);
										const hexVal = rgbToHex(rgbVal.r, rgbVal.g, rgbVal.b);
										return (
											<button
												key={hexVal}
												type="button"
												onClick={() => {
													onChange(hexVal);
													if (onHoverEnd) onHoverEnd();
													setIsOpen(false);
												}}
												onMouseEnter={() => onHover?.(hexVal)}
												onMouseLeave={() => onHoverEnd?.()}
												className="color-picker-palette-btn"
												style={{
													backgroundColor: hexVal,
													border: color.toLowerCase() === hexVal.toLowerCase()
														? "2px solid var(--text)"
														: "1px solid var(--border-color)",
												}}
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
											<button
												type="button"
												onClick={() => {
													onChange(themeColor);
													if (onHoverEnd) onHoverEnd();
													setIsOpen(false);
												}}
												onMouseEnter={() => onHover?.(themeColor)}
												onMouseLeave={() => onHoverEnd?.()}
												className="color-picker-palette-btn"
												style={{
													backgroundColor: themeColor,
													border: color.toLowerCase() === themeColor.toLowerCase()
														? "2px solid var(--text)"
														: "1px solid var(--border-color)",
												}}
											/>
										</div>
										<div className="color-picker-grid-spacer" />
										<div className="color-picker-shades">
											{LCH_LIGHTNESS_STEPS.map((l) => {
												const rgbVal = lchToRgb(l, lchTheme.C, lchTheme.h);
												const hexVal = rgbToHex(rgbVal.r, rgbVal.g, rgbVal.b);
												return (
													<button
														key={hexVal}
														type="button"
														onClick={() => {
															onChange(hexVal);
															if (onHoverEnd) onHoverEnd();
															setIsOpen(false);
														}}
														onMouseEnter={() => onHover?.(hexVal)}
														onMouseLeave={() => onHoverEnd?.()}
														className="color-picker-palette-btn"
														style={{
															backgroundColor: hexVal,
															border: color.toLowerCase() === hexVal.toLowerCase()
																? "2px solid var(--text)"
																: "1px solid var(--border-color)",
														}}
													/>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>

						<div className="color-picker-inputs">
							<div className="color-picker-input-group">
								<span className="color-picker-label">Hex</span>
								<input
									type="text"
									value={localHex}
									onChange={handleHexChange}
									className="color-picker-input"
									spellCheck={false}
								/>
							</div>
							<div className="color-picker-input-group">
								<span className="color-picker-label">RGB</span>
								<div className="color-picker-rgb-inputs">
									{(["r", "g", "b"] as const).map((p) => (
										<input
											key={p}
											type="text"
											value={p === "r" ? r : p === "g" ? g : b}
											onChange={(e) => handleRgbChange(p, e.target.value)}
											className="color-picker-input"
											maxLength={3}
										/>
									))}
								</div>
							</div>
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}

export default ColorPicker;
