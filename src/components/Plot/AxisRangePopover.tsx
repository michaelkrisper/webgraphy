// Min/Max entry for one axis (R on a focused axis zone, or right-click).
// Lazy-loaded: nothing here is needed until the first range edit.

import { useEffect, useId, useRef, useState } from "react";
import {
	formatAxisValue,
	type RangeField,
	validateAxisRange,
} from "../../utils/axisRange";

export interface AxisRangePopoverProps {
	kind: "x" | "y";
	axisId: string;
	min: number;
	max: number;
	isDate: boolean;
	log: boolean;
	/** Position inside the plot area. */
	style: React.CSSProperties;
	onApply: (range: { min: number; max: number }) => void;
	onCancel: () => void;
}

export default function AxisRangePopover({
	kind,
	axisId,
	min,
	max,
	isDate,
	log,
	style,
	onApply,
	onCancel,
}: AxisRangePopoverProps) {
	const [minText, setMinText] = useState(() => formatAxisValue(min, isDate));
	const [maxText, setMaxText] = useState(() => formatAxisValue(max, isDate));
	const [error, setError] = useState<{ field: RangeField; text: string } | null>(
		null,
	);
	const rootRef = useRef<HTMLFormElement>(null);
	const minRef = useRef<HTMLInputElement>(null);
	const maxRef = useRef<HTMLInputElement>(null);
	const errorId = useId();
	const axisName = `${kind.toUpperCase()} axis ${axisId.replace(/^axis-/, "")}`;

	useEffect(() => {
		minRef.current?.select();
	}, []);

	// A press anywhere else dismisses it, like a menu.
	const cancelRef = useRef(onCancel);
	useEffect(() => {
		cancelRef.current = onCancel;
	}, [onCancel]);
	useEffect(() => {
		const onDown = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) cancelRef.current();
		};
		document.addEventListener("pointerdown", onDown, true);
		return () => document.removeEventListener("pointerdown", onDown, true);
	}, []);

	const submit = () => {
		const result = validateAxisRange(minText, maxText, { isDate, log });
		if (!result.ok) {
			setError({ field: result.field, text: result.error });
			(result.field === "min" ? minRef : maxRef).current?.focus();
			return;
		}
		onApply({ min: result.min, max: result.max });
	};

	const field = (
		label: "Min" | "Max",
		ref: React.RefObject<HTMLInputElement | null>,
		value: string,
		setValue: (v: string) => void,
	) => {
		const invalid = error?.field === label.toLowerCase();
		return (
			<label className="axis-range-field">
				<span>{label}</span>
				<input
					ref={ref}
					className="axis-range-input"
					value={value}
					spellCheck={false}
					autoComplete="off"
					aria-invalid={invalid || undefined}
					aria-describedby={invalid ? errorId : undefined}
					onChange={(e) => {
						setValue(e.target.value);
						if (error) setError(null);
					}}
				/>
			</label>
		);
	};

	return (
		<form
			ref={rootRef}
			role="dialog"
			aria-label={`Range of ${axisName}`}
			className="axis-range-popover"
			style={style}
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
			onKeyDown={(e) => {
				// Keys typed here belong to the form, not to the chart shortcuts.
				e.stopPropagation();
				if (e.key === "Escape") {
					e.preventDefault();
					onCancel();
				}
			}}
			// The plot area underneath starts a pan / zoom on these.
			onMouseDown={(e) => e.stopPropagation()}
			onDoubleClick={(e) => e.stopPropagation()}
			onWheel={(e) => e.stopPropagation()}
			onContextMenu={(e) => e.stopPropagation()}
		>
			{field("Min", minRef, minText, setMinText)}
			{field("Max", maxRef, maxText, setMaxText)}
			{error && (
				<div id={errorId} className="axis-range-error" role="alert">
					{error.text}
				</div>
			)}
			<div className="axis-range-actions">
				<button type="button" className="axis-range-btn" onClick={onCancel}>
					Cancel
				</button>
				<button type="submit" className="axis-range-btn axis-range-btn--primary">
					Apply
				</button>
			</div>
		</form>
	);
}
