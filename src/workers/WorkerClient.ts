export class WorkerClient<Req, Res extends { id?: number }, ParsedRes> {
	private worker: Worker | null = null;
	private nextId = 1;
	private pending = new Map<
		number,
		{ resolve: (value: ParsedRes) => void; reject: (reason: unknown) => void }
	>();

	private workerFactory: () => Worker;
	private onMessage: (
		data: Res,
		resolve: (value: ParsedRes) => void,
		reject: (reason: unknown) => void,
	) => void;

	constructor(
		workerFactory: () => Worker,
		onMessage: (
			data: Res,
			resolve: (value: ParsedRes) => void,
			reject: (reason: unknown) => void,
		) => void,
	) {
		this.workerFactory = workerFactory;
		this.onMessage = onMessage;
	}

	private ensureWorker(): Worker {
		if (this.worker) return this.worker;
		this.worker = this.workerFactory();
		this.worker.onmessage = (ev: MessageEvent<Res>) => {
			const data = ev.data;
			if (data.id === undefined) return;
			const entry = this.pending.get(data.id);
			if (!entry) return;
			this.pending.delete(data.id);
			this.onMessage(data, entry.resolve, entry.reject);
		};
		this.worker.onerror = (ev) => {
			const err =
				ev instanceof Error ? ev : new Error(ev.message ?? "Worker error");
			for (const entry of this.pending.values()) entry.reject(err);
			this.pending.clear();
			this.worker?.terminate();
			this.worker = null;
		};
		return this.worker;
	}

	public request(
		createPayload: (id: number) => Req,
		transfer?: Transferable[],
	): Promise<ParsedRes> {
		const id = this.nextId++;
		const w = this.ensureWorker();
		return new Promise<ParsedRes>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			const req = createPayload(id);
			if (transfer) {
				w.postMessage(req, transfer);
			} else {
				w.postMessage(req);
			}
		});
	}
}
