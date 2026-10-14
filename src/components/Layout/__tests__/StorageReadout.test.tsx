import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistence } from "../../../services/persistence";
import { StorageReadout } from "../StorageReadout";

const listeners = new Set<() => void>();

vi.mock("../../../services/persistence", () => ({
	persistence: {
		getStorageInfo: vi.fn(),
		isEnabled: vi.fn(() => true),
	},
	onStorageChange: (l: () => void) => {
		listeners.add(l);
		return () => listeners.delete(l);
	},
}));

const MB = 1024 * 1024;

describe("StorageReadout", () => {
	beforeEach(() => {
		listeners.clear();
		vi.clearAllMocks();
		vi.mocked(persistence.isEnabled).mockReturnValue(true);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("shows usage, quota and persistence state", async () => {
		vi.mocked(persistence.getStorageInfo).mockResolvedValue({
			usage: 5 * MB,
			quota: 1024 * MB,
			persisted: true,
		});
		render(<StorageReadout />);

		expect(
			await screen.findByText("5.0 MB used of 1.0 GB (0.5%)"),
		).toBeInTheDocument();
		expect(screen.getByText(/protected from eviction/)).toBeInTheDocument();
	});

	it("explains when usage is unavailable and saving is off", async () => {
		vi.mocked(persistence.getStorageInfo).mockResolvedValue(null);
		vi.mocked(persistence.isEnabled).mockReturnValue(false);
		render(<StorageReadout />);

		expect(
			await screen.findByText("Usage is not available in this browser."),
		).toBeInTheDocument();
		expect(
			screen.getByText("Saving is off for this session."),
		).toBeInTheDocument();
	});

	it("re-estimates once, debounced, after a burst of storage changes", async () => {
		vi.useFakeTimers();
		vi.mocked(persistence.getStorageInfo).mockResolvedValue({
			usage: 0,
			quota: 0,
			persisted: false,
		});
		const { unmount } = render(<StorageReadout />);
		await act(async () => {});
		expect(persistence.getStorageInfo).toHaveBeenCalledTimes(1);

		vi.mocked(persistence.getStorageInfo).mockResolvedValue({
			usage: 2 * MB,
			quota: 4 * MB,
			persisted: false,
		});
		act(() => {
			for (const l of listeners) l();
			for (const l of listeners) l();
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
		});
		expect(persistence.getStorageInfo).toHaveBeenCalledTimes(2);
		expect(screen.getByText("2.0 MB used of 4.0 MB (50.0%)")).toBeInTheDocument();

		unmount();
		expect(listeners.size).toBe(0);
	});
});
