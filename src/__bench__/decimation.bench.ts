import { bench, describe } from "vitest";
import { m4ByXFloat32, m4Float32, m4MergeOctave } from "../utils/decimation";
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
	bench("reference workload", () => {
		controlWorkload();
	});
});

describe("decimation", () => {
	bench("m4Float32 10k -> 512", () => {
		m4Float32(small.x, small.y, 512, outSmall);
	});

	bench("m4Float32 1M -> 2048", () => {
		m4Float32(large.x, large.y, 2048, outLarge);
	});

	bench("m4ByXFloat32 1M full span", () => {
		m4ByXFloat32(large.x, large.y, 0, 0, LARGE, LARGE / 2048, outLarge);
	});

	bench("m4ByXFloat32 1M zoomed to 1%", () => {
		// The common interactive case: a narrow window over a large column.
		m4ByXFloat32(large.x, large.y, 0, 400_000, 410_000, 10, outLarge);
	});
});

describe("decimation — octave merge", () => {
	// A prepared fine level, merged one octave up. This is the pyramid build
	// step, so it runs whenever a series or its bucket ladder changes.
	const width = 64;
	const level = m4ByXFloat32(large.x, large.y, 0, 0, LARGE, width);
	const levelX = new Float32Array(level.x);
	const levelY = new Float32Array(level.y);

	bench("m4MergeOctave", () => {
		m4MergeOctave(levelX, levelY, 0, width * 2);
	});
});
