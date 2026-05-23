import type React from "react";
import { useMemo, useState } from "react";
import {
	CONSTANTS,
	type FormulaCategory,
	FUNCTIONS,
	type FormulaFunctionMeta,
} from "../../utils/formulaFunctions";

interface FormulaReferenceProps {
	onInsert: (text: string, isFunction: boolean) => void;
}

const CATEGORY_LABELS: Record<FormulaCategory, string> = {
	math: "Math",
	trig: "Trigonometry",
	stat: "Aggregates",
	rolling: "Rolling / smoothing",
	row: "Row-relative",
	time: "Time buckets",
	logic: "Logic",
	regression: "Regression",
	constant: "Constants",
};

const CATEGORY_ORDER: FormulaCategory[] = [
	"math",
	"trig",
	"stat",
	"rolling",
	"row",
	"time",
	"logic",
	"regression",
	"constant",
];

/** Display-friendly insertion strings for the user-typed function names. */
const FUNCTION_DISPLAY_NAMES: Record<string, string> = {
	rolling: "rolling",
	rollingc: "rollingC",
	rollingr: "rollingR",
	rollingtime: "rollingTime",
	rollingtimec: "rollingTimeC",
	rollingtimer: "rollingTimeR",
	rollingmed: "rollingMed",
	rollingstd: "rollingStd",
	rollingmin: "rollingMin",
	rollingmax: "rollingMax",
	avgday: "avgDay",
	avghour: "avgHour",
	avgminute: "avgMinute",
	avgsecond: "avgSecond",
	sumday: "sumDay",
	sumhour: "sumHour",
	summinute: "sumMinute",
	sumsecond: "sumSecond",
};

function displayName(meta: FormulaFunctionMeta): string {
	return FUNCTION_DISPLAY_NAMES[meta.name] ?? meta.name;
}

export const FormulaReference: React.FC<FormulaReferenceProps> = ({
	onInsert,
}) => {
	const [search, setSearch] = useState("");
	const [openCategory, setOpenCategory] = useState<FormulaCategory | "all">(
		"all",
	);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		const byCategory: Record<FormulaCategory, FormulaFunctionMeta[]> = {
			math: [],
			trig: [],
			stat: [],
			rolling: [],
			row: [],
			time: [],
			logic: [],
			regression: [],
			constant: [],
		};
		for (const f of FUNCTIONS) {
			if (openCategory !== "all" && f.category !== openCategory) continue;
			if (q) {
				const hay = `${displayName(f)} ${f.signature} ${f.description}`.toLowerCase();
				if (!hay.includes(q)) continue;
			}
			byCategory[f.category].push(f);
		}
		return byCategory;
	}, [search, openCategory]);

	const matchedConstants = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (openCategory !== "all" && openCategory !== "constant") return [];
		return CONSTANTS.filter(
			(c) =>
				!q ||
				c.name.toLowerCase().includes(q) ||
				c.description.toLowerCase().includes(q),
		);
	}, [search, openCategory]);

	return (
		<div className="formula-ref">
			<div className="formula-ref-toolbar">
				<input
					type="search"
					className="formula-ref-search"
					placeholder="Search functions… (e.g. ‘rolling’, ‘log’)"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Search formula functions"
				/>
				<select
					className="formula-ref-filter"
					value={openCategory}
					onChange={(e) =>
						setOpenCategory(e.target.value as FormulaCategory | "all")
					}
					aria-label="Filter by category"
				>
					<option value="all">All categories</option>
					{CATEGORY_ORDER.map((cat) => (
						<option key={cat} value={cat}>
							{CATEGORY_LABELS[cat]}
						</option>
					))}
				</select>
			</div>

			<div className="formula-ref-body">
				{matchedConstants.length > 0 && (
					<section className="formula-ref-section">
						<h4 className="formula-ref-section-title">Constants</h4>
						<ul className="formula-ref-list">
							{matchedConstants.map((c) => (
								<li key={c.name} className="formula-ref-item">
									<button
										type="button"
										className="formula-ref-insert"
										onClick={() => onInsert(c.name, false)}
										title={`Insert ${c.name}`}
									>
										<code>{c.name}</code>
									</button>
									<span className="formula-ref-desc">{c.description}</span>
								</li>
							))}
						</ul>
					</section>
				)}

				{CATEGORY_ORDER.map((cat) => {
					const items = filtered[cat];
					if (!items.length) return null;
					return (
						<section key={cat} className="formula-ref-section">
							<h4 className="formula-ref-section-title">
								{CATEGORY_LABELS[cat]}
							</h4>
							<ul className="formula-ref-list">
								{items.map((f) => (
									<li key={f.name} className="formula-ref-item">
										<button
											type="button"
											className="formula-ref-insert"
											onClick={() =>
												onInsert(`${displayName(f)}(`, true)
											}
											title={`Insert ${displayName(f)}(…)`}
										>
											<code>{f.signature}</code>
										</button>
										<span className="formula-ref-desc">{f.description}</span>
									</li>
								))}
							</ul>
						</section>
					);
				})}

				{search.trim() &&
					CATEGORY_ORDER.every((c) => filtered[c].length === 0) &&
					matchedConstants.length === 0 && (
						<div className="formula-ref-empty">
							No functions match “{search}”.
						</div>
					)}
			</div>
		</div>
	);
};
