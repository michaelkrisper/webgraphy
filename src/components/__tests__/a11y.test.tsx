import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import type { SeriesConfig } from "../../services/persistence";
import { ChartLegend } from "../Plot/ChartLegend";
import { EmptyState } from "../Plot/EmptyState";
import { HelpModal } from "../Layout/HelpModal";
import { ImprintModal } from "../Layout/ImprintModal";
import { LicenseModal } from "../Layout/LicenseModal";

/**
 * A broad axe sweep over the components that are cheap to render in
 * isolation. It will not catch everything — axe cannot judge focus order or
 * whether a label is meaningful — but it does catch the regressions that are
 * easy to introduce and invisible in review: an unlabelled control, an
 * invalid ARIA attribute, a heading level skipped.
 */

const series: SeriesConfig[] = [
	{
		id: "s1",
		name: "Temperature",
		yColumn: "temp",
		sourceId: "ds-1",
		yAxisId: "axis-1",
		lineColor: "#e11d48",
		hidden: false,
	} as SeriesConfig,
	{
		id: "s2",
		name: "Humidity",
		yColumn: "hum",
		sourceId: "ds-1",
		yAxisId: "axis-1",
		lineColor: "#2563eb",
		hidden: true,
	} as SeriesConfig,
];

const cases: Array<[string, () => React.ReactElement]> = [
	[
		"EmptyState",
		() => (
			<EmptyState
				width={600}
				height={400}
				padding={{ top: 10, right: 10, bottom: 40, left: 50 }}
			/>
		),
	],
	[
		"ChartLegend",
		() => (
			<ChartLegend
				series={series}
				onToggleVisibility={vi.fn()}
				onHighlight={vi.fn()}
			/>
		),
	],
	["HelpModal", () => <HelpModal onClose={vi.fn()} />],
	["ImprintModal", () => <ImprintModal onClose={vi.fn()} />],
	["LicenseModal", () => <LicenseModal onClose={vi.fn()} />],
];

describe("accessibility sweep", () => {
	for (const [name, renderCase] of cases) {
		it(`${name} has no axe violations`, async () => {
			const { container } = render(renderCase());
			expect(await axe(container)).toHaveNoViolations();
		});
	}
});
