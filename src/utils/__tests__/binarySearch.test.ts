import { describe, expect, it } from "vitest";
import {
  findClosest,
  findExact,
  findFirstGE,
  findLastLE,
  findSegmentStartIndex,
} from "../binarySearch";

describe("findLastLE", () => {
  it("returns last index whose value <= target", () => {
    const arr = [0, 1, 2, 5, 8];
    expect(findLastLE(arr, 5)).toBe(3);
    expect(findLastLE(arr, 6)).toBe(3);
    expect(findLastLE(arr, 0)).toBe(0);
  });

  it("respects refOffset", () => {
    const arr = new Float32Array([0, 1, 2, 5, 8]);
    // values shifted by 10 -> [10,11,12,15,18]; target 12 -> idx 2
    expect(findLastLE(arr, 12, 10)).toBe(2);
  });

  it("returns fallback when no element matches", () => {
    expect(findLastLE([5, 6, 7], 3, 0, -1)).toBe(-1);
  });
});

describe("findFirstGE", () => {
  it("returns first index whose value >= target", () => {
    const arr = [0, 1, 2, 5, 8];
    expect(findFirstGE(arr, 3)).toBe(3);
    expect(findFirstGE(arr, 0)).toBe(0);
    expect(findFirstGE(arr, 8)).toBe(4);
  });

  it("respects refOffset", () => {
    const arr = new Float32Array([0, 1, 2, 5, 8]);
    // shifted +10 -> first >= 13 is idx 3 (value 15)
    expect(findFirstGE(arr, 13, 10)).toBe(3);
  });

  it("returns fallback when no element matches", () => {
    expect(findFirstGE([1, 2, 3], 10, 0, -1)).toBe(-1);
  });
});

describe("findClosest", () => {
  it("returns nearest index", () => {
    const arr = [0, 10, 20, 30];
    expect(findClosest(arr, 12)).toBe(1);
    expect(findClosest(arr, 16)).toBe(2);
    expect(findClosest(arr, -5)).toBe(0);
    expect(findClosest(arr, 100)).toBe(3);
  });

  it("respects refOffset", () => {
    const arr = new Float32Array([0, 10, 20]);
    // shifted +5 -> [5,15,25]; closest to 14 is idx 1
    expect(findClosest(arr, 14, 5)).toBe(1);
  });

  it("returns 0 on empty input", () => {
    expect(findClosest([], 5)).toBe(0);
  });
});

describe("findSegmentStartIndex", () => {
  it("returns correct segment index when sliceStart is strictly inside a segment", () => {
    const segments = [
      { start: 0, end: 10 },
      { start: 15, end: 25 },
      { start: 30, end: 40 },
    ];
    expect(findSegmentStartIndex(segments, 20)).toBe(1);
  });

  it("returns correct segment index when sliceStart matches a segment's start boundary", () => {
    const segments = [
      { start: 0, end: 10 },
      { start: 15, end: 25 },
      { start: 30, end: 40 },
    ];
    expect(findSegmentStartIndex(segments, 15)).toBe(1);
  });

  it("returns correct segment index when sliceStart is before the first segment", () => {
    const segments = [
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ];
    expect(findSegmentStartIndex(segments, 5)).toBe(0);
  });

  it("returns 0 when sliceStart is after all segments", () => {
    const segments = [
      { start: 0, end: 10 },
      { start: 15, end: 25 },
    ];
    expect(findSegmentStartIndex(segments, 50)).toBe(0);
  });

  it("works correctly with a single-segment array", () => {
    const segments = [{ start: 10, end: 20 }];
    expect(findSegmentStartIndex(segments, 15)).toBe(0);
    expect(findSegmentStartIndex(segments, 5)).toBe(0);
    expect(findSegmentStartIndex(segments, 25)).toBe(0);
  });
});

describe("findExact", () => {
  it("returns index of target", () => {
    const arr = [0, 1.5, 3, 4.5, 6];
    expect(findExact(arr, 3)).toBe(2);
    expect(findExact(arr, 6)).toBe(4);
    expect(findExact(arr, 0)).toBe(0);
  });

  it("returns -1 if target is not found", () => {
    const arr = [0, 1.5, 3, 4.5, 6];
    expect(findExact(arr, 5)).toBe(-1);
    expect(findExact(arr, -1)).toBe(-1);
    expect(findExact(arr, 7)).toBe(-1);
  });

  it("returns -1 on empty array", () => {
    expect(findExact([], 5)).toBe(-1);
  });
});
