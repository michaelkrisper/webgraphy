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

	private rejectAll(err: Error) {
		const entries = [...this.pending.values()];
		this.pending.clear();
		for (const entry of entries) entry.reject(err);
	}

	private ensureWorker(): Worker {
		if (this.worker) return this.worker;
		const worker = this.workerFactory();
		worker.onmessage = (ev: MessageEvent<Res>) => {
			const data = ev.data;
			if (data.id === undefined) return;
			const entry = this.pending.get(data.id);
			if (!entry) return;
			this.pending.delete(data.id);
			this.onMessage(data, entry.resolve, entry.reject);
		};
		// An undeserialisable reply carries no id, so we cannot tell whose it was;
		// failing every in-flight request beats leaving one hanging forever.
		worker.onmessageerror = () => {
			this.rejectAll(new Error("Could not read the worker's response"));
		};
		// A crash loses all in-flight work and any state the worker held; drop it
		// so the next request lazily starts a fresh one.
		worker.onerror = (ev) => {
			const err =
				ev instanceof Error ? ev : new Error(ev.message || "Worker error");
			worker.terminate();
			if (this.worker === worker) this.worker = null;
			this.rejectAll(err);
		};
		this.worker = worker;
		return worker;
	}

	public request(
		createPayload: (id: number) => Req,
		transfer?: Transferable[],
	): Promise<ParsedRes> {
		const id = this.nextId++;
		return new Promise<ParsedRes>((resolve, reject) => {
			try {
				const w = this.ensureWorker();
				this.pending.set(id, { resolve, reject });
				const req = createPayload(id);
				if (transfer) {
					w.postMessage(req, transfer);
				} else {
					w.postMessage(req);
				}
			} catch (err) {
				// e.g. DataCloneError for a detached buffer: nothing was sent, so no
				// reply will ever settle this entry.
				this.pending.delete(id);
				reject(err);
			}
		});
	}
}
