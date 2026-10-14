import { describe, expect, it } from "vitest";
import {
	defaultDelimiterFor,
	IMPORT_ACCEPT,
	importFileType,
	readTextHead,
} from "../importFile";

describe("importFileType", () => {
	it.each([
		["data.csv", "csv"],
		["DATA.CSV", "csv"],
		["data.tsv", "csv"],
		["notes.TXT", "csv"],
		["log.dat", "csv"],
		["data.json", "json"],
		["Data.Json", "json"],
		["book.xlsx", "excel"],
		["book.XLS", "excel"],
		["book.ods", "excel"],
		["archive.tar.csv", "csv"],
	])("%s -> %s", (name, type) => {
		expect(importFileType(name)).toBe(type);
	});

	it.each(["image.png", "README", "csv", "data.csv.bak", ""])(
		"rejects %j",
		(name) => {
			expect(importFileType(name)).toBeNull();
		},
	);

	it("lists every routed extension in the accept string", () => {
		for (const ext of IMPORT_ACCEPT.split(",")) {
			expect(importFileType(`x${ext}`)).not.toBeNull();
		}
	});
});

describe("defaultDelimiterFor", () => {
	it("defaults .tsv to tab only", () => {
		expect(defaultDelimiterFor("a.TSV")).toBe("\t");
		expect(defaultDelimiterFor("a.csv")).toBeUndefined();
	});
});

describe("readTextHead", () => {
	it("returns small files whole", async () => {
		const res = await readTextHead(new Blob(["a,b\n1,2\n"]), 64);
		expect(res).toEqual({ text: "a,b\n1,2\n", truncated: false });
	});

	it("cuts large files back to the last complete line", async () => {
		const res = await readTextHead(new Blob(["a,b\n1,2\n3,4\n5,6"]), 10);
		expect(res).toEqual({ text: "a,b\n1,2", truncated: true });
	});

	it("drops a multi-byte character split by the byte slice", async () => {
		const res = await readTextHead(new Blob(["x\näää"]), 4);
		expect(res).toEqual({ text: "x", truncated: true });
	});

	it("keeps the slice when it holds no line break", async () => {
		const res = await readTextHead(new Blob(["abcdefgh"]), 4);
		expect(res).toEqual({ text: "abcd", truncated: true });
	});
});
