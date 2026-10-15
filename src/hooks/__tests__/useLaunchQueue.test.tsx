import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	dismissNotification,
	useNotificationStore,
} from "../../store/useNotificationStore";
import { useLaunchQueue } from "../useLaunchQueue";

type Consumer = (params: { files?: FileSystemFileHandle[] }) => Promise<void>;

function installLaunchQueue() {
	const setConsumer = vi.fn<(c: Consumer) => void>();
	(window as { launchQueue?: unknown }).launchQueue = { setConsumer };
	return {
		setConsumer,
		consumer: () => setConsumer.mock.calls.at(-1)?.[0] as Consumer,
	};
}

const handle = (file: File) =>
	({ getFile: () => Promise.resolve(file) }) as unknown as FileSystemFileHandle;

describe("useLaunchQueue", () => {
	afterEach(() => {
		delete (window as { launchQueue?: unknown }).launchQueue;
		for (const n of useNotificationStore.getState().notifications)
			dismissNotification(n.id);
	});

	it("does nothing without the File Handling API", () => {
		expect(() => renderHook(() => useLaunchQueue(vi.fn()))).not.toThrow();
	});

	it("routes launched files into the import callback", async () => {
		const queue = installLaunchQueue();
		const onFiles = vi.fn();
		renderHook(() => useLaunchQueue(onFiles));

		const a = new File(["x,y\n1,2"], "a.csv");
		const b = new File(["[]"], "b.json");
		await queue.consumer()({ files: [handle(a), handle(b)] });
		expect(onFiles).toHaveBeenCalledWith([a, b]);
	});

	it("ignores launches without files", async () => {
		const queue = installLaunchQueue();
		const onFiles = vi.fn();
		renderHook(() => useLaunchQueue(onFiles));
		await queue.consumer()({});
		await queue.consumer()({ files: [] });
		expect(onFiles).not.toHaveBeenCalled();
	});

	it("sets the consumer once and calls the latest callback", async () => {
		const queue = installLaunchQueue();
		const first = vi.fn();
		const latest = vi.fn();
		const { rerender } = renderHook(({ cb }) => useLaunchQueue(cb), {
			initialProps: { cb: first },
		});
		rerender({ cb: latest });
		expect(queue.setConsumer).toHaveBeenCalledTimes(1);

		await queue.consumer()({ files: [handle(new File([""], "c.tsv"))] });
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledTimes(1);
	});

	it("reports a file that cannot be read", async () => {
		const queue = installLaunchQueue();
		const onFiles = vi.fn();
		renderHook(() => useLaunchQueue(onFiles));
		const broken = {
			getFile: () => Promise.reject(new Error("permission denied")),
		} as unknown as FileSystemFileHandle;
		await queue.consumer()({ files: [broken] });
		expect(onFiles).not.toHaveBeenCalled();
		expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
			kind: "error",
			message: expect.stringContaining("permission denied"),
		});
	});
});
