import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	chooseImportFiles,
	chooseSaveTarget,
	downloadBlob,
	downloadTarget,
	EXPORT_PICKER_ID,
	IMPORT_FILE_TYPE,
	WORKSPACE_PICKER_ID,
} from "../fileAccess";
import { IMPORT_ACCEPT } from "../importFile";

const CSV = { description: "CSV file", accept: { "text/csv": [".csv"] } };

const abortError = () =>
	new DOMException("The user aborted a request.", "AbortError");

function fileHandle(name: string) {
	const writable = {
		write: vi.fn<(blob: Blob) => Promise<void>>(async () => {}),
		close: vi.fn(async () => {}),
		abort: vi.fn(async () => {}),
	};
	return {
		handle: {
			name,
			createWritable: vi.fn(async () => writable),
			getFile: vi.fn(async () => new File(["a,b"], name)),
		},
		writable,
	};
}

let downloads: string[];
let revoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
	downloads = [];
	revoke = vi.fn();
	vi.spyOn(console, "warn").mockImplementation(() => {});
	URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
	URL.revokeObjectURL = revoke as typeof URL.revokeObjectURL;
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
		this: HTMLAnchorElement,
	) {
		downloads.push(this.download);
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	document.body.innerHTML = "";
});

describe("downloadBlob", () => {
	it("downloads through an object URL and revokes it afterwards", () => {
		vi.useFakeTimers();
		downloadBlob(new Blob(["a"]), "f.csv");
		expect(downloads).toEqual(["f.csv"]);
		expect(document.querySelector("a")).toBeNull();
		expect(revoke).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(revoke).toHaveBeenCalledWith("blob:mock");
	});

	it("downloadTarget downloads under the given name without asking", async () => {
		const target = downloadTarget("plain.csv");
		expect(target.name).toBe("plain.csv");
		await target.write(new Blob(["a"]));
		expect(downloads).toEqual(["plain.csv"]);
	});
});

describe("chooseSaveTarget", () => {
	it("asks through the save picker and writes to the chosen file", async () => {
		const { handle, writable } = fileHandle("renamed.csv");
		const picker = vi.fn(async () => handle);
		vi.stubGlobal("showSaveFilePicker", picker);

		const target = await chooseSaveTarget("data.csv", CSV);
		expect(picker).toHaveBeenCalledWith({
			suggestedName: "data.csv",
			types: [CSV],
			id: EXPORT_PICKER_ID,
		});
		expect(target?.name).toBe("renamed.csv");

		const blob = new Blob(["x"]);
		await target?.write(blob);
		expect(writable.write).toHaveBeenCalledWith(blob);
		expect(writable.close).toHaveBeenCalled();
		expect(downloads).toEqual([]);
	});

	it("passes the picker id on", async () => {
		const picker = vi.fn(async () => fileHandle("s.webgraphy").handle);
		vi.stubGlobal("showSaveFilePicker", picker);
		await chooseSaveTarget("s.webgraphy", CSV, WORKSPACE_PICKER_ID);
		expect(picker).toHaveBeenCalledWith(
			expect.objectContaining({ id: WORKSPACE_PICKER_ID }),
		);
	});

	it("resolves null when the user cancels, without a download", async () => {
		vi.stubGlobal(
			"showSaveFilePicker",
			vi.fn(async () => {
				throw abortError();
			}),
		);
		expect(await chooseSaveTarget("data.csv", CSV)).toBeNull();
		expect(downloads).toEqual([]);
		expect(console.warn).not.toHaveBeenCalled();
	});

	it("downloads when the picker refuses for another reason", async () => {
		vi.stubGlobal(
			"showSaveFilePicker",
			vi.fn(async () => {
				throw new DOMException("Must be handling a user gesture", "SecurityError");
			}),
		);
		const target = await chooseSaveTarget("data.csv", CSV);
		expect(target?.name).toBe("data.csv");
		await target?.write(new Blob(["a"]));
		expect(downloads).toEqual(["data.csv"]);
		expect(console.warn).toHaveBeenCalled();
	});

	it("downloads where the API is missing (Firefox, Safari)", async () => {
		const target = await chooseSaveTarget("data.csv", CSV);
		await target?.write(new Blob(["a"]));
		expect(downloads).toEqual(["data.csv"]);
	});

	it("downloads inside a frame, even where the API exists", async () => {
		const picker = vi.fn();
		vi.stubGlobal("showSaveFilePicker", picker);
		vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
		const target = await chooseSaveTarget("data.csv", CSV);
		await target?.write(new Blob(["a"]));
		expect(picker).not.toHaveBeenCalled();
		expect(downloads).toEqual(["data.csv"]);
	});

	it("aborts the write and rethrows when writing fails", async () => {
		const { handle, writable } = fileHandle("data.csv");
		writable.write.mockRejectedValueOnce(new Error("disk full"));
		vi.stubGlobal(
			"showSaveFilePicker",
			vi.fn(async () => handle),
		);
		const target = await chooseSaveTarget("data.csv", CSV);
		await expect(target?.write(new Blob(["a"]))).rejects.toThrow("disk full");
		expect(writable.abort).toHaveBeenCalled();
		expect(writable.close).not.toHaveBeenCalled();
	});
});

describe("chooseImportFiles", () => {
	it("offers every importable extension in the picker", () => {
		const offered = Object.values(IMPORT_FILE_TYPE.accept).flat().sort();
		expect(offered).toEqual(IMPORT_ACCEPT.split(",").sort());
	});

	it("opens the chosen files through the open picker", async () => {
		const a = fileHandle("a.csv").handle;
		const b = fileHandle("b.webgraphy").handle;
		const picker = vi.fn(async () => [a, b]);
		vi.stubGlobal("showOpenFilePicker", picker);

		const files = await chooseImportFiles();
		expect(picker).toHaveBeenCalledWith({
			types: [IMPORT_FILE_TYPE],
			multiple: true,
			id: WORKSPACE_PICKER_ID,
		});
		expect(files?.map((f) => f.name)).toEqual(["a.csv", "b.webgraphy"]);
	});

	it("resolves null when the user cancels the picker", async () => {
		vi.stubGlobal(
			"showOpenFilePicker",
			vi.fn(async () => {
				throw abortError();
			}),
		);
		const click = vi.spyOn(HTMLInputElement.prototype, "click");
		expect(await chooseImportFiles()).toBeNull();
		expect(click).not.toHaveBeenCalled();
	});

	describe("without the picker: a file input", () => {
		let input: HTMLInputElement | null;

		beforeEach(() => {
			input = null;
			vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {
				input = document.querySelector('input[type="file"]');
			});
		});

		it("accepts the import types and resolves with the chosen files", async () => {
			const chosen = chooseImportFiles();
			await vi.waitFor(() => expect(input).not.toBeNull());
			const el = input as unknown as HTMLInputElement;
			expect(el.type).toBe("file");
			expect(el.accept).toBe(IMPORT_ACCEPT);
			expect(el.multiple).toBe(true);
			expect(el.isConnected).toBe(true);

			const file = new File(["x"], "x.csv");
			Object.defineProperty(el, "files", { value: [file] });
			el.dispatchEvent(new Event("change"));
			expect(await chosen).toEqual([file]);
			expect(el.isConnected).toBe(false);
		});

		it("resolves null on cancel", async () => {
			const chosen = chooseImportFiles();
			await vi.waitFor(() => expect(input).not.toBeNull());
			const el = input as unknown as HTMLInputElement;
			el.dispatchEvent(new Event("cancel"));
			expect(await chosen).toBeNull();
			expect(el.isConnected).toBe(false);
		});

		it("is also the fallback when the picker refuses", async () => {
			vi.stubGlobal(
				"showOpenFilePicker",
				vi.fn(async () => {
					throw new DOMException("No gesture", "SecurityError");
				}),
			);
			const chosen = chooseImportFiles();
			await vi.waitFor(() => expect(input).not.toBeNull());
			(input as unknown as HTMLInputElement).dispatchEvent(new Event("cancel"));
			expect(await chosen).toBeNull();
			expect(console.warn).toHaveBeenCalled();
		});
	});
});
