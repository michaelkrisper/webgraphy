import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
	FormulaEvaluationResult,
	FormulaWorkerParams,
} from "../../utils/formula";

describe("evaluateFormulaInWorker", () => {
	let mockWorker: {
		postMessage: ReturnType<typeof vi.fn>;
		onmessage: ((ev: unknown) => void) | null;
		onerror: ((ev: unknown) => void) | null;
		terminate: ReturnType<typeof vi.fn>;
		addEventListener: ReturnType<typeof vi.fn>;
		removeEventListener: ReturnType<typeof vi.fn>;
		dispatchEvent: ReturnType<typeof vi.fn>;
	};

	const makeParams = (name: string): FormulaWorkerParams => ({
		datasetId: "ds1",
		name,
		formula: "[a] + 1",
		columns: ["a"],
		rowCount: 1,
		columnData: [{ data: new Float32Array([1]), refPoint: 0 }],
	});

	beforeEach(() => {
		mockWorker = {
			postMessage: vi.fn(),
			onmessage: null,
			onerror: null,
			terminate: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		};

		class MockWorker {
			constructor() {
				return mockWorker;
			}
		}

		vi.stubGlobal("Worker", MockWorker);
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("tags each request with an id and resolves the matching response", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const params = makeParams("result");
		const evaluationPromise = evaluateFormulaInWorker(params);

		// The client assigns an id before posting.
		const posted = mockWorker.postMessage.mock.calls[0][0] as FormulaWorkerParams;
		expect(posted.id).toBeDefined();
		expect(posted.name).toBe("result");

		const result = {
			id: posted.id,
			type: "success",
		} as FormulaEvaluationResult;
		mockWorker.onmessage?.({ data: result });

		expect(await evaluationPromise).toBe(result);
	});

	it("resolves concurrent evaluations independently by id, even out of order", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const p1 = evaluateFormulaInWorker(makeParams("first"));
		const p2 = evaluateFormulaInWorker(makeParams("second"));

		const id1 = (mockWorker.postMessage.mock.calls[0][0] as FormulaWorkerParams)
			.id;
		const id2 = (mockWorker.postMessage.mock.calls[1][0] as FormulaWorkerParams)
			.id;
		expect(id1).not.toBe(id2);

		// Respond to the second request first to prove correlation by id.
		mockWorker.onmessage?.({ data: { id: id2, type: "success", name: "second" } });
		mockWorker.onmessage?.({ data: { id: id1, type: "success", name: "first" } });

		expect((await p1).name).toBe("first");
		expect((await p2).name).toBe("second");
	});

	it("ignores responses without a known id", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const promise = evaluateFormulaInWorker(makeParams("x"));
		const posted = mockWorker.postMessage.mock.calls[0][0] as FormulaWorkerParams;

		// Stray message with an unknown id must not resolve the pending promise.
		mockWorker.onmessage?.({ data: { id: 9999, type: "success" } });
		// The real response then resolves it.
		mockWorker.onmessage?.({ data: { id: posted.id, type: "success" } });

		await expect(promise).resolves.toMatchObject({ type: "success" });
	});

	it("rejects all in-flight promises on worker error (Error object)", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const promise = evaluateFormulaInWorker(makeParams("x"));
		const error = new Error("Test worker error");
		mockWorker.onerror?.(error);

		await expect(promise).rejects.toBe(error);
	});

	it("rejects on worker error event with a message", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const promise = evaluateFormulaInWorker(makeParams("x"));
		mockWorker.onerror?.({ message: "Worker initialization failed" });

		await expect(promise).rejects.toThrow("Worker initialization failed");
	});

	it("rejects on worker error event without a message", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const promise = evaluateFormulaInWorker(makeParams("x"));
		mockWorker.onerror?.({});

		await expect(promise).rejects.toThrow("Worker error");
	});
});
