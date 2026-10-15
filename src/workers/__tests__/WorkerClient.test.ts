import { describe, expect, it, vi } from "vitest";
import { WorkerClient } from "../WorkerClient";

type Req = { id: number; value: string };
type Res = { id?: number; ok: boolean; value?: string };

class FakeWorker {
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onmessageerror: ((ev: MessageEvent) => void) | null = null;
	onerror: ((ev: ErrorEvent) => void) | null = null;
	postMessage = vi.fn();
	terminate = vi.fn();

	reply(data: Res) {
		this.onmessage?.({ data } as MessageEvent);
	}
	lastId(): number {
		return this.postMessage.mock.calls.at(-1)?.[0].id;
	}
}

function setup() {
	const workers: FakeWorker[] = [];
	const factory = vi.fn(() => {
		const w = new FakeWorker();
		workers.push(w);
		return w as unknown as Worker;
	});
	const client = new WorkerClient<Req, Res, string>(
		factory,
		(data, resolve, reject) =>
			data.ok ? resolve(data.value ?? "") : reject(new Error("failed")),
	);
	const send = (value = "x", transfer?: Transferable[]) =>
		client.request((id) => ({ id, value }), transfer);
	return { client, factory, workers, send };
}

describe("WorkerClient", () => {
	it("creates the worker lazily and once", () => {
		const { factory, send } = setup();
		expect(factory).not.toHaveBeenCalled();
		void send();
		void send();
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it("routes replies by id", async () => {
		const { workers, send } = setup();
		const a = send("a");
		const b = send("b");
		const [w] = workers;
		const [idA, idB] = w.postMessage.mock.calls.map((c) => c[0].id);
		w.reply({ id: idB, ok: true, value: "B" });
		w.reply({ id: idA, ok: false });
		await expect(b).resolves.toBe("B");
		await expect(a).rejects.toThrow("failed");
	});

	it("ignores replies without or with unknown ids", async () => {
		const { workers, send } = setup();
		const p = send();
		const [w] = workers;
		w.reply({ ok: true, value: "no id" });
		w.reply({ id: 999, ok: true, value: "stranger" });
		w.reply({ id: w.lastId(), ok: true, value: "mine" });
		await expect(p).resolves.toBe("mine");
	});

	it("passes the transfer list through", () => {
		const { workers, send } = setup();
		const buf = new ArrayBuffer(4);
		void send("x", [buf]);
		expect(workers[0].postMessage).toHaveBeenCalledWith(
			{ id: expect.any(Number), value: "x" },
			[buf],
		);
	});

	it("rejects and forgets a request whose postMessage throws", async () => {
		const { client, workers, send } = setup();
		void send("warm-up");
		const [w] = workers;
		const cloneError = new DOMException("detached", "DataCloneError");
		w.postMessage.mockImplementationOnce(() => {
			throw cloneError;
		});
		await expect(send("bad")).rejects.toBe(cloneError);
		expect(
			(client as unknown as { pending: Map<number, unknown> }).pending.size,
		).toBe(1); // only the warm-up request

		const next = send("next");
		w.reply({ id: w.lastId(), ok: true, value: "ok" });
		await expect(next).resolves.toBe("ok");
	});

	it("rejects when the worker factory throws", async () => {
		const client = new WorkerClient<Req, Res, string>(
			() => {
				throw new Error("no workers here");
			},
			() => {},
		);
		await expect(client.request((id) => ({ id, value: "x" }))).rejects.toThrow(
			"no workers here",
		);
	});

	it("fails all in-flight requests on messageerror", async () => {
		const { workers, send } = setup();
		const a = send("a");
		const b = send("b");
		workers[0].onmessageerror?.({} as MessageEvent);
		await expect(a).rejects.toThrow("Could not read the worker's response");
		await expect(b).rejects.toThrow("Could not read the worker's response");
	});

	it("rejects everything on a crash and starts a fresh worker next time", async () => {
		const { factory, workers, send } = setup();
		const a = send("a");
		const b = send("b");
		const [first] = workers;
		first.onerror?.({ message: "boom" } as ErrorEvent);
		await expect(a).rejects.toThrow("boom");
		await expect(b).rejects.toThrow("boom");
		expect(first.terminate).toHaveBeenCalled();

		const c = send("c");
		expect(factory).toHaveBeenCalledTimes(2);
		const second = workers[1];
		second.reply({ id: second.lastId(), ok: true, value: "C" });
		await expect(c).resolves.toBe("C");
	});

	it("falls back to a generic message for a crash without one", async () => {
		const { workers, send } = setup();
		const p = send();
		workers[0].onerror?.({ message: "" } as ErrorEvent);
		await expect(p).rejects.toThrow("Worker error");
	});
});
