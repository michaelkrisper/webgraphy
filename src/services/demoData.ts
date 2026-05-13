import { secureRandom } from "../utils/random";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
	YAxisConfig,
} from "./persistence";

function generateRawWeatherData(
	rowCount: number,
	startTime: number,
): number[][] {
	const rawData: number[][] = [];
	for (let i = 0; i < rowCount; i++) {
		const ts = startTime + i * 60; // 1 minute resolution
		const minutesElapsed = i;
		const hourOfDay = (minutesElapsed / 60) % 24;
		const dayOfYear = (minutesElapsed / (24 * 60)) % 365;

		// --- Temperature (Smooth Sine with Day/Night) ---
		const seasonal = Math.sin((dayOfYear / 365) * 2 * Math.PI - Math.PI / 2);
		const daily = Math.sin(((hourOfDay - 6) / 24) * 2 * Math.PI - Math.PI / 2);
		let temp = 15 + seasonal * 10 + daily * 5;
		temp += (secureRandom() - 0.5) * 0.5; // low noise

		// --- Humidity (Inversely related to temperature) ---
		let humidity = 60 - daily * 20 - seasonal * 10;
		humidity += (secureRandom() - 0.5) * 2;
		humidity = Math.max(20, Math.min(100, humidity));

		// --- Solar Irradiance (Parabolic day curves) ---
		let solar = 0;
		const sunrise = 6;
		const sunset = 18;
		if (hourOfDay > sunrise && hourOfDay < sunset) {
			const progress = (hourOfDay - sunrise) / (sunset - sunrise);
			solar = Math.sin(progress * Math.PI) * (800 + seasonal * 200);
			if (secureRandom() > 0.95) solar *= 0.3; // cloud passing
		}

		// --- Wind Speed (Random Walk with peaks) ---
		const windBase = 3 + Math.sin(minutesElapsed / 500) * 2;
		let wind =
			windBase +
			(secureRandom() > 0.98 ? secureRandom() * 10 : secureRandom() * 2);
		wind = Math.max(0, wind);

		rawData.push([ts, temp, humidity, solar, wind]);
	}
	return rawData;
}

export function generateDemoDataset(rowCount = 10000): Dataset {
	const columns = [
		"Timestamp",
		"Temperature (°C)",
		"Humidity (%)",
		"Solar Irradiance (W/m²)",
		"Wind Speed (m/s)",
	];
	const datasetId = "demo-dataset";

	const currentYear = new Date().getFullYear();
	const startTime = Math.floor(new Date(currentYear, 0, 1).getTime() / 1000);

	const rawData = generateRawWeatherData(rowCount, startTime);
	const data = columns.map((colName, colIdx) => {
		const refPoint = rawData[0][colIdx];
		const float32Data = new Float32Array(rowCount);
		let min = Infinity;
		let max = -Infinity;

		for (let i = 0; i < rowCount; i++) {
			const val = rawData[i][colIdx];
			if (val < min) min = val;
			if (val > max) max = val;
			float32Data[i] = val - refPoint;
		}

		return {
			isFloat64: colName === "Timestamp",
			refPoint,
			bounds: { min, max },
			data: float32Data,
		} as DataColumn;
	});

	const prefix = "Demo: ";
	return {
		id: datasetId,
		name: "Weather Demo",
		columns: columns.map((c) => `${prefix}${c}`),
		data,
		rowCount,
		xAxisColumn: `${prefix}${columns[0]}`,
		xAxisId: "axis-1",
	};
}

function createDemoYAxes(): YAxisConfig[] {
	return [
		{
			id: "axis-1",
			name: "Temp & Hum",
			min: -5,
			max: 100,
			position: "left",
			color: "#4589ff",
			showGrid: true,
		},
		{
			id: "axis-2",
			name: "Solar",
			min: 0,
			max: 1200,
			position: "left",
			color: "#3dbf6e",
			showGrid: false,
		},
		{
			id: "axis-3",
			name: "Wind",
			min: 0,
			max: 20,
			position: "right",
			color: "#00a69c",
			showGrid: false,
		},
	];
}

function createDemoSeries(dataset: Dataset): SeriesConfig[] {
	return [
		{
			id: crypto.randomUUID(),
			sourceId: dataset.id,
			name: "Temperature",
			yColumn: dataset.columns[1],
			yAxisId: "axis-1",
			pointStyle: "none",
			pointColor: "#4589ff",
			lineStyle: "solid",
			lineColor: "#4589ff",
		},
		{
			id: crypto.randomUUID(),
			sourceId: dataset.id,
			name: "Humidity",
			yColumn: dataset.columns[2],
			yAxisId: "axis-1",
			pointStyle: "none",
			pointColor: "#f0a830",
			lineStyle: "dashed",
			lineColor: "#f0a830",
		},
		{
			id: crypto.randomUUID(),
			sourceId: dataset.id,
			name: "Solar Irradiance",
			yColumn: dataset.columns[3],
			yAxisId: "axis-2",
			pointStyle: "square",
			pointColor: "#3dbf6e",
			lineStyle: "none",
			lineColor: "#3dbf6e",
		},
		{
			id: crypto.randomUUID(),
			sourceId: dataset.id,
			name: "Wind Speed",
			yColumn: dataset.columns[4],
			yAxisId: "axis-3",
			pointStyle: "circle",
			pointColor: "#00a69c",
			lineStyle: "solid",
			lineColor: "#00a69c",
		},
	];
}

export const getDemoAppState = (dataset: Dataset) => ({
	yAxes: createDemoYAxes(),
	series: createDemoSeries(dataset),
	axisTitles: { x: "Time", y: "Value" },
});
