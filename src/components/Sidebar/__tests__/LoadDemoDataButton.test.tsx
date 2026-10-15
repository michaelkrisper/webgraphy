import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { useGraphStore } from "../../../store/useGraphStore";
import { useNotificationStore } from "../../../store/useNotificationStore";
import { LoadDemoDataButton } from "../LoadDemoDataButton";

vi.mock("../../../store/useGraphStore", () => {
	const store = vi.fn() as Mock & { getState: Mock };
	store.getState = vi.fn();
	return { useGraphStore: store };
});

const loadDemoData = vi.fn().mockResolvedValue(undefined);

function withDatasets(datasets: unknown[]) {
	const state = { datasets, loadDemoData };
	(useGraphStore as unknown as Mock).mockImplementation(
		(sel: (s: typeof state) => unknown) => sel(state),
	);
	(useGraphStore.getState as Mock).mockReturnValue(state);
}

describe("LoadDemoDataButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useNotificationStore.setState({ notifications: [] });
	});

	it("loads straight away when there is no data yet", () => {
		withDatasets([]);
		render(<LoadDemoDataButton />);
		fireEvent.click(screen.getByRole("button", { name: /Demo data/ }));
		expect(loadDemoData).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("asks before adding to existing data, and Cancel adds nothing", async () => {
		withDatasets([{ id: "ds-1" }]);
		render(<LoadDemoDataButton />);
		fireEvent.click(screen.getByRole("button", { name: /Demo data/ }));
		const dialog = await screen.findByRole("alertdialog", {
			name: "Load demo data?",
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(loadDemoData).not.toHaveBeenCalled();
	});

	it("adds the demo data alongside on confirm and says so", async () => {
		withDatasets([{ id: "ds-1" }]);
		render(<LoadDemoDataButton />);
		fireEvent.click(screen.getByRole("button", { name: /Demo data/ }));
		fireEvent.click(await screen.findByRole("button", { name: "Add alongside" }));
		expect(loadDemoData).toHaveBeenCalledTimes(1);
		await waitFor(() =>
			expect(useNotificationStore.getState().notifications).toEqual([
				expect.objectContaining({ kind: "success", message: "Demo data added" }),
			]),
		);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});
});
