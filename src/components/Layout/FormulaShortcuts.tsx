import type React from "react";

const SHORTCUT_GROUPS = [
	{
		label: "Operators",
		items: [
			{ label: "+", insert: "+", title: "" },
			{ label: "−", insert: "-", title: "" },
			{ label: "×", insert: "*", title: "" },
			{ label: "÷", insert: "/", title: "" },
			{ label: "xⁿ", insert: "^", title: "Power / exponent" },
			{ label: "(", insert: "(", title: "" },
			{ label: ")", insert: ")", title: "" },
		],
	},
	{
		label: "Constants",
		items: [
			{ label: "π", insert: "pi", title: "Pi (3.14159…)" },
			{ label: "e", insert: "e", title: "Euler's number (2.71828…)" },
		],
	},
	{
		label: "Functions",
		items: [
			{
				label: "avg()",
				insert: "avg()",
				title: "Average of ALL numeric columns in this row",
			},
			{
				label: "avgDay(x)",
				insert: "avgDay(",
				title: "Cumulative average resetting every Day",
			},
			{
				label: "avgHour(x)",
				insert: "avgHour(",
				title: "Cumulative average resetting every Hour",
			},
			{ label: "sqrt(x)", insert: "sqrt(", title: "Square root" },
			{ label: "sin(x)", insert: "sin(", title: "Sine (radians)" },
			{ label: "cos(x)", insert: "cos(", title: "Cosine (radians)" },
			{ label: "tan(x)", insert: "tan(", title: "Tangent (radians)" },
			{ label: "log(x)", insert: "log(", title: "Base-10 logarithm" },
			{
				label: "avg5(x)",
				insert: "avg5(",
				title:
					"Rolling average over N rows (central by default). Alignment suffix: avg5c = central, avg5l = left/trailing, avg5r = right/leading",
			},
			{
				label: "avg5s(x)",
				insert: "avg5s(",
				title:
					"Rolling average over time window: avgNs/avgNm/avgNh/avgNd. Central by default. Alignment suffix: avg5sc, avg5sl, avg5sr",
			},
			{
				label: "filter(x)",
				insert: "filter(",
				title: "Kalman filter (adaptive noise smoothing)",
			},
			{
				label: "linreg",
				insert: "linreg(",
				title: "Linear regression: linreg([col])",
			},
			{
				label: "polyreg",
				insert: "polyreg(",
				title:
					"Polynomial regression: polyreg([col], degree). Default degree=3",
			},
			{
				label: "expreg",
				insert: "expreg(",
				title: "Exponential regression: expreg([col])",
			},
			{
				label: "logreg",
				insert: "logreg(",
				title: "Logistic regression: logreg([col])",
			},
			{
				label: "kde",
				insert: "kde(",
				title: "KDE smoothing: kde([col]) or kde([col], bandwidth)",
			},
		],
	},
];

interface FormulaShortcutsProps {
	onInsertOperator: (insertText: string) => void;
}

export const FormulaShortcuts: React.FC<FormulaShortcutsProps> = ({
	onInsertOperator,
}) => {
	return (
		<div className="calc-shortcuts">
			<div className="calc-shortcuts-label">Shortcuts</div>
			{SHORTCUT_GROUPS.map((group) => (
				<div key={group.label} className="calc-shortcut-group">
					<div className="calc-shortcut-group-label">{group.label}</div>
					<div className="calc-shortcut-btns">
						{group.items.map((item) => (
							<button
								key={item.label}
								type="button"
								onClick={() => onInsertOperator(item.insert)}
								title={item.title}
								className="calc-shortcut-btn"
							>
								{item.label}
							</button>
						))}
					</div>
				</div>
			))}
		</div>
	);
};
