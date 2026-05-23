import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FormulaWorkerParams, FormulaEvaluationResult } from "../../utils/formula";

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

		// Reset modules to clear cached worker state
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("should send message to worker and resolve when worker responds", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const params: FormulaWorkerParams = {
			formulaId: "1",
			ast: { type: "NumberLiteral", value: 42 },
			dataset: {
				id: "ds1",
				name: "test",
				columns: [],
				data: [],
				originalData: [],
				hiddenColumns: new Set(),
				isDemo: false,
			},
		};

		const evaluationPromise = evaluateFormulaInWorker(params);

		expect(mockWorker.postMessage).toHaveBeenCalledWith(params);
		expect(mockWorker.onmessage).toBeDefined();

		const result = {
			type: "success",
			newColumn: { id: "col1", name: "Result", type: "number" },
		} as unknown as FormulaEvaluationResult;

		mockWorker.onmessage?.({ data: result });

		const res = await evaluationPromise;
		expect(res).toBe(result);
	});

	it("should reject promise on worker error (Error object)", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const params = {} as unknown as FormulaWorkerParams;
		const evaluationPromise = evaluateFormulaInWorker(params);

		expect(mockWorker.onerror).toBeDefined();

		const error = new Error("Test worker error");
		mockWorker.onerror?.(error);

		await expect(evaluationPromise).rejects.toThrow("Test worker error");
		await expect(evaluationPromise).rejects.toBe(error);
	});

	it("should reject promise on worker error (Event with message)", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const params = {} as unknown as FormulaWorkerParams;
		const evaluationPromise = evaluateFormulaInWorker(params);

		mockWorker.onerror?.({ message: "Worker initialization failed" });

		await expect(evaluationPromise).rejects.toThrow("Worker initialization failed");
	});

	it("should reject promise on worker error (Event without message)", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const params = {} as unknown as FormulaWorkerParams;
		const evaluationPromise = evaluateFormulaInWorker(params);

		mockWorker.onerror?.({});

		await expect(evaluationPromise).rejects.toThrow("Worker error");
	});

	it("should preempt if multiple formulas are evaluated concurrently", async () => {
		const { evaluateFormulaInWorker } = await import("../formulaClient");

		const params1 = { formulaId: "1" } as unknown as FormulaWorkerParams;
		const params2 = { formulaId: "2" } as unknown as FormulaWorkerParams;

		const promise1 = evaluateFormulaInWorker(params1);
		const promise2 = evaluateFormulaInWorker(params2);

		await expect(promise1).rejects.toThrow("Formula worker preempted");

		mockWorker.onmessage?.({ data: { type: "success" } });

		const res2 = await promise2;
		expect(res2).toEqual({ type: "success" });
	});
});
