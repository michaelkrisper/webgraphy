/// <reference lib="webworker" />

export interface ExcelWorkerRequest {
    id: number;
    action: "read" | "changeSheet";
    file?: File;
    workbookData?: ArrayBuffer;
    sheetName?: string;
}

export interface ExcelWorkerResponse {
    id: number;
    type: "success" | "error";
    preview?: string;
    fullCsv?: string;
    sheets?: string[];
    selectedSheet?: string;
    workbookData?: ArrayBuffer; // We pass this back so main thread can hold it for changeSheet without holding the parsed object
    error?: string;
}

self.onmessage = async (ev: MessageEvent<ExcelWorkerRequest>) => {
    const { id, action, file, workbookData, sheetName } = ev.data;
    try {
        const XLSX = await import("xlsx");
        if (action === "read" && file) {
            const data = new Uint8Array(await file.arrayBuffer());
            const workbook = XLSX.read(data, { type: "array" });
            const sheets = workbook.SheetNames;
            const selectedSheet = sheets[0];
            const fullCsv = XLSX.utils.sheet_to_csv(workbook.Sheets[selectedSheet]);
            const preview = fullCsv.split("\n").slice(0, 500).join("\n");

            (self as DedicatedWorkerGlobalScope).postMessage({
                id,
                type: "success",
                preview,
                fullCsv,
                sheets,
                selectedSheet,
                workbookData: data.buffer,
            } as ExcelWorkerResponse, [data.buffer]);

        } else if (action === "changeSheet" && workbookData && sheetName) {
            const data = new Uint8Array(workbookData);
            const workbook = XLSX.read(data, { type: "array" });
            const fullCsv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
            const preview = fullCsv.split("\n").slice(0, 500).join("\n");

            (self as DedicatedWorkerGlobalScope).postMessage({
                id,
                type: "success",
                preview,
                fullCsv,
                selectedSheet: sheetName,
                workbookData: data.buffer,
            } as ExcelWorkerResponse, [data.buffer]);
        }
    } catch (err) {
        (self as DedicatedWorkerGlobalScope).postMessage({
            id,
            type: "error",
            error: err instanceof Error ? err.message : String(err),
        } as ExcelWorkerResponse);
    }
};
