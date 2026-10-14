import { describe } from "vitest";
import { benchCase } from "./benchCase";
import {
	m4ByLogXFloat32,
	m4ByXFloat32,
	m4Float32,
	m4MergeOctave,
} from "../utils/decimation";
import { controlWorkload } from "./control";
import { LARGE, makeSeries, SMALL } from "./fixtures";

/**
 * Decimation is the reason a million-point series can be panned at all: it is
 * on every frame, for every visible series. A regression here is felt directly
 * as dropped frames.
 */

const small = makeSeries(SMALL);
const large = makeSeries(LARGE);

// Reusable output buffers, matching how the renderer calls these in the hot
// path — benchmarking the allocating variant would measure the wrong thing.
const outSmall = { x: new Float32Array(4096), y: new Float32Array(4096) };
const outLarge = { x: new Float32Array(16384), y: new Float32Array(16384) };

describe("control", () => {
	benchCase("reference workload", () => {
		controlWorkload();
	});
});

describe("decimation", () => {
	benchCase("m4Float32 10k -> 512", () => {
		m4Float32(small.x, small.y, 512, outSmall);
	});

	benchCase("m4Float32 1M -> 2048", () => {
		m4Float32(large.x, large.y, 2048, outLarge);
	});

	benchCase("m4ByXFloat32 1M full span", () => {
		m4ByXFloat32(large.x, large.y, 0, 0, LARGE, LARGE / 2048, outLarge);
	});

	benchCase("m4ByXFloat32 1M zoomed to 1%", () => {
		// The common interactive case: a narrow window over a large column.
		m4ByXFloat32(large.x, large.y, 0, 400_000, 410_000, 10, outLarge);
	});
});

describe("decimation — log x", () => {
	// The same column on a log axis: xRef 1 puts it at [1, 1e6], six decades.
	// Bucket counts match the linear cases (2048 full span, 1000 zoomed);
	// the zoom is 1% of the visible span in decades, ~37k samples.
	benchCase("m4ByLogXFloat32 1M full span", () => {
		m4ByLogXFloat32(large.x, large.y, 1, 1, LARGE, 6 / 2048, outLarge);
	});

	benchCase("m4ByLogXFloat32 1M zoomed to 1%", () => {
		m4ByLogXFloat32(large.x, large.y, 1, 10 ** 5.4, 10 ** 5.46, 6e-5, outLarge);
	});
});

describe("decimation — octave merge", () => {
	// A prepared fine level, merged one octave up. This is the pyramid build
	// step, so it runs whenever a series or its bucket ladder changes.
	const width = 64;
	const level = m4ByXFloat32(large.x, large.y, 0, 0, LARGE, width);
	const levelX = new Float32Array(level.x);
	const levelY = new Float32Array(level.y);

	benchCase("m4MergeOctave", () => {
		m4MergeOctave(levelX, levelY, 0, width * 2);
	});
});
