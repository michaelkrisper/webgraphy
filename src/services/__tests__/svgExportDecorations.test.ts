import { describe, expect, it } from "vitest";
import { THEMES } from "../../themes";
import { estimateTextWidth, type Rect, rectsIntersect } from "../exportLayout";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../persistence";
import { exportToSVG, fitAxisTitle, type SvgExportOptions } from "../svgExport";

const col = (values: number[]) => ({
	data: new Float32Array(values),
	bounds: { min: Math.min(...values), max: Math.max(...values) },
	isFloat64: false,
	refPoint: 0,
});

const datasets: Dataset[] = [
	{
		id: "d1",
		name: "<D1>",
		columns: ["T<x>", "A", "B"],
		rowCount: 3,
		xAxisColumn: "T<x>",
		xAxisId: "axis-1",
		data: [col([0, 5, 10]), col([1, 2, 3]), col([4, 5, 6])],
	},
	{
		id: "d2",
		name: "D2",
		columns: ["U", "C"],
		rowCount: 3,
		xAxisColumn: "U",
		xAxisId: "axis-2",
		data: [col([0, 1, 2]), col([7, 8, 9])],
	},
];

const s = (o: Partial<SeriesConfig> & { id: string }): SeriesConfig => ({
	sourceId: "d1",
	name: o.id,
	yColumn: "A",
	yAxisId: "y1",
	pointStyle: "none",
	pointColor: "#111111",
	lineStyle: "solid",
	lineColor: "#222222",
	...o,
});

const series: SeriesConfig[] = [
	s({ id: "a", name: 'Alpha <b>&"', lineStyle: "dashed", pointStyle: "circle" }),
	s({ id: "b", name: "Beta", yColumn: "B", yAxisId: "y2", lineStyle: "dotted" }),
	s({ id: "h", name: "Hidden one", hidden: true }),
	s({
		id: "c",
		name: "Gamma",
		sourceId: "d2",
		yColumn: "C",
		yAxisId: "y3",
		lineStyle: "none",
		pointStyle: "square",
	}),
];

// Two stacked x axes, two left y axes and one right y axis.
const xAxes: XAxisConfig[] = ["axis-1", "axis-2"].map((id) => ({
	id,
	name: id,
	min: 0,
	max: 10,
	showGrid: true,
	xMode: "numeric" as const,
}));
const yAxes: YAxisConfig[] = [
	{
		id: "y1",
		name: "",
		min: 0,
		max: 10,
		position: "left",
		color: "#000",
		showGrid: true,
	},
	{
		id: "y2",
		name: "",
		min: 0,
		max: 10,
		position: "left",
		color: "#000",
		showGrid: false,
	},
	{
		id: "y3",
		name: "",
		min: 0,
		max: 10,
		position: "right",
		color: "#000",
		showGrid: false,
	},
];

const W = 900;
const H = 600;
const render = (options: SvgExportOptions = {}) =>
	exportToSVG(datasets, series, xAxes, yAxes, W, H, THEMES.light, options);
const parse = (svg: string) =>
	new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

const rectOf = (el: Element): Rect => ({
	x: Number(el.getAttribute("x")),
	y: Number(el.getAttribute("y")),
	width: Number(el.getAttribute("width")),
	height: Number(el.getAttribute("height")),
});
/** The frame of the plot area: the one rect with stroke-width 2. */
const plotFrame = (root: Element) =>
	rectOf(root.querySelector('rect[stroke-width="2"]') as Element);
const legendBox = (root: Element) =>
	rectOf(root.querySelector("g > rect[stroke-width='1']") as Element);

describe("exportToSVG legend", () => {
	it("is left out unless asked for", () => {
		const root = parse(render());
		expect(root.querySelector("g > rect[stroke-width='1']")).toBeNull();
	});

	it("lists the drawn series, escaped, with dash and marker swatches", () => {
		const svg = render({ legend: "top-right" });
		expect(svg).not.toContain("<b>");
		const root = parse(svg);
		expect(root.querySelector("parsererror")).toBeNull();
		const legend = root.querySelector("g > rect[stroke-width='1']")
			?.parentElement as Element;
		const labels = Array.from(legend.querySelectorAll("text")).map(
			(t) => t.textContent,
		);
		expect(labels).toEqual(['Alpha <b>&"', "Beta", "Gamma"]);
		const lines = legend.querySelectorAll("line");
		expect(lines).toHaveLength(2);
		expect(lines[0].getAttribute("stroke-dasharray")).toBe("6,4");
		expect(lines[1].getAttribute("stroke-dasharray")).toBe("2,3");
		expect(legend.querySelectorAll("circle")).toHaveLength(1);
		// Gamma: point-only series, a square marker and no line.
		expect(legend.querySelectorAll("rect[width='5']")).toHaveLength(1);
	});

	it("sits inside the plot frame for a corner position", () => {
		const root = parse(render({ legend: "bottom-left" }));
		const frame = plotFrame(root);
		const box = legendBox(root);
		expect(box.x).toBeGreaterThanOrEqual(frame.x);
		expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
	});

	it("outside right moves the plot and right axis left to make room", () => {
		const plain = plotFrame(parse(render()));
		const root = parse(render({ legend: "outside-right" }));
		const frame = plotFrame(root);
		const box = legendBox(root);
		expect(frame.width).toBeLessThan(plain.width);
		expect(frame.x).toBe(plain.x);
		// Clear of the plot and of the right axis' gutter and tick labels.
		expect(rectsIntersect(box, frame)).toBe(false);
		const rightAxisLabels = Array.from(
			root.querySelectorAll("text[text-anchor='start']"),
		).filter((t) => Number(t.getAttribute("x")) > frame.x + frame.width);
		expect(rightAxisLabels.length).toBeGreaterThan(0);
		for (const t of rightAxisLabels)
			expect(
				Number(t.getAttribute("x")) + estimateTextWidth(t.textContent ?? "", 12),
			).toBeLessThan(box.x);
		expect(box.x + box.width).toBeLessThanOrEqual(W);
	});
});

describe("exportToSVG title", () => {
	it("is escaped and drawn above the plot, which moves down", () => {
		const plain = plotFrame(parse(render()));
		const svg = render({ title: `<script>"x"</script> & 'y'=1` });
		expect(svg).not.toContain("<script>");
		const root = parse(svg);
		const title = root.querySelector("text[font-size='16']") as Element;
		expect(title.textContent).toBe(`<script>"x"</script> & 'y'=1`);
		const frame = plotFrame(root);
		expect(frame.y).toBeGreaterThan(plain.y);
		expect(frame.height).toBeLessThan(plain.height);
		expect(Number(title.getAttribute("y"))).toBeLessThan(frame.y - 8);
		// The stacked x axes keep their full gutter below.
		expect(H - (frame.y + frame.height)).toBe(H - (plain.y + plain.height));
	});

	it("is left out when blank", () => {
		expect(render({ title: "   " })).not.toContain('font-size="16"');
	});
});

describe("exportToSVG y axis gutters", () => {
	it("keeps every y axis title clear of the tick labels", () => {
		const root = parse(render({ legend: "outside-right", title: "T" }));
		const frame = plotFrame(root);
		const titleBands = Array.from(root.querySelectorAll("g[transform]")).map(
			(g) => {
				const x = Number(
					/translate\(([-\d.]+)/.exec(g.getAttribute("transform") ?? "")?.[1],
				);
				return { x: x - 10, width: 20 };
			},
		);
		expect(titleBands).toHaveLength(3);
		const labels = Array.from(root.querySelectorAll("text[font-size='12']"))
			.filter((t) => {
				const x = Number(t.getAttribute("x"));
				return x < frame.x || x > frame.x + frame.width;
			})
			.filter((t) => t.getAttribute("text-anchor") !== "middle");
		expect(labels.length).toBeGreaterThan(0);
		for (const label of labels) {
			const x = Number(label.getAttribute("x"));
			const w = estimateTextWidth(label.textContent ?? "", 12);
			const left = label.getAttribute("text-anchor") === "end" ? x - w : x;
			for (const band of titleBands)
				expect(
					left + w <= band.x || left >= band.x + band.width,
					`"${label.textContent}" at ${left} overlaps a title at ${band.x}`,
				).toBe(true);
		}
	});
});

describe("fitAxisTitle", () => {
	const mono = (t: string) => t.length * 10;
	const names = [
		{ text: "Temp", color: "#a" },
		{ text: "Humidity", color: "#b" },
	];

	it("joins the coloured names with uncoloured separators", () => {
		expect(fitAxisTitle(names, 1000, mono)).toEqual([
			{ text: "Temp", color: "#a" },
			{ text: " / " },
			{ text: "Humidity", color: "#b" },
		]);
	});

	it("cuts the name that runs past the plot height", () => {
		expect(fitAxisTitle(names, 120, mono)).toEqual([
			{ text: "Temp", color: "#a" },
			{ text: " / " },
			{ text: "Humi…", color: "#b" },
		]);
	});

	it("ends with an ellipsis when the next name does not fit at all", () => {
		expect(fitAxisTitle(names, 75, mono)).toEqual([
			{ text: "Temp", color: "#a" },
			{ text: " …" },
		]);
	});

	it("keeps the y axis title within the plot height in the SVG", () => {
		const long = series.map((x) => ({
			...x,
			name: `${x.name} ${"long ".repeat(30)}`,
		}));
		const root = parse(
			exportToSVG(datasets, long, xAxes, yAxes, W, 300, THEMES.light),
		);
		const frame = plotFrame(root);
		for (const g of root.querySelectorAll("g[transform]")) {
			const text = g.querySelector("text")?.textContent ?? "";
			expect(text.endsWith("…")).toBe(true);
			expect(estimateTextWidth(text, 14, true)).toBeLessThanOrEqual(frame.height);
		}
	});
});

describe("exportToSVG top legend band", () => {
	it("lays the entries out in rows above the plot when nothing else fits", () => {
		const root = parse(
			exportToSVG(datasets, series, xAxes, yAxes, 360, 400, THEMES.light, {
				legend: "outside-right",
				title: "Narrow",
			}),
		);
		const frame = plotFrame(root);
		const box = legendBox(root);
		expect(box.y + box.height).toBeLessThan(frame.y - 8);
		const texts = Array.from(
			(
				root.querySelector("g > rect[stroke-width='1']")?.parentElement as Element
			).querySelectorAll("text"),
		);
		const ys = texts.map((t) => Number(t.getAttribute("y")));
		// Row-major, two entries per row at this width.
		expect(ys).toHaveLength(3);
		expect(ys[1]).toBe(ys[0]);
		expect(ys[2]).toBeGreaterThan(ys[0]);
	});
});

describe("exportToSVG output options", () => {
	it("escapes dataset column names in axis titles", () => {
		const svg = render();
		expect(svg).not.toContain("T<x>");
		expect(svg).toContain("T&lt;x&gt;");
	});

	it("drops the background for a transparent export", () => {
		const opaque = render();
		expect(opaque).toContain(`fill="${THEMES.light.plotBg}" />`);
		const transparent = render({ transparent: true });
		expect(transparent).not.toContain('height="100%"');
		expect(transparent).not.toContain("background:");
	});

	it("sizes the root in millimetres while keeping the px viewBox", () => {
		const root = parse(render({ physical: { widthMm: 85, heightMm: 64.004 } }));
		expect(root.getAttribute("width")).toBe("85mm");
		expect(root.getAttribute("height")).toBe("64mm");
		expect(root.getAttribute("viewBox")).toBe(`0 0 ${W} ${H}`);
	});

	it("embeds font rules in a style element", () => {
		const css =
			'@font-face{font-family:"IBM Plex Sans";src:url(data:font/woff2;base64,AAAA) format("woff2");}';
		const root = parse(render({ fontFaceCss: css }));
		expect(root.querySelector("defs > style")?.textContent).toBe(css);
	});

	it("lays out with the supplied text measurer", () => {
		const narrow = legendBox(
			parse(render({ legend: "top-left", measureText: () => 10 })),
		);
		const wide = legendBox(
			parse(render({ legend: "top-left", measureText: () => 100 })),
		);
		expect(wide.width - narrow.width).toBe(90);
	});
});
