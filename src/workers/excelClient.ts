import type { ExcelWorkerRequest, ExcelWorkerResponse } from "./excel.worker";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
    number,
    {
        resolve: (value: Omit<ExcelWorkerResponse, "id" | "type">) => void;
        reject: (reason: unknown) => void;
    }
>();

function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL("./excel.worker.ts", import.meta.url), {
        type: "module",
    });
    worker.onmessage = (ev: MessageEvent<ExcelWorkerResponse>) => {
        const { id, type, error, ...data } = ev.data;
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        if (type === "success") entry.resolve(data);
        else entry.reject(new Error(error ?? "Excel worker error"));
    };
    worker.onerror = (ev) => {
        const err = ev instanceof Error ? ev : new Error(ev.message ?? "Worker error");
        for (const entry of pending.values()) entry.reject(err);
        pending.clear();
        worker?.terminate();
        worker = null;
    };
    return worker;
}

export function readExcelFileInWorker(file: File): Promise<Omit<ExcelWorkerResponse, "id" | "type">> {
    const id = nextId++;
    const w = ensureWorker();
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const req: ExcelWorkerRequest = { id, action: "read", file };
        w.postMessage(req);
    });
}

export function changeSheetInWorker(
    workbookData: ArrayBuffer,
    sheetName: string
): Promise<Omit<ExcelWorkerResponse, "id" | "type">> {
    const id = nextId++;
    const w = ensureWorker();
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const req: ExcelWorkerRequest = { id, action: "changeSheet", workbookData, sheetName };
        w.postMessage(req, [workbookData]);
    });
}
