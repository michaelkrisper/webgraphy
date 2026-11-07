// Lets code outside the plot (the WebMCP tools) drive the viewport without a
// store write: ranges and fits must go through ChartContainer's target refs
// and rAF loop, so the mounted chart registers its handlers here.

export interface ViewportCommands {
	/** Sets one axis to an exact range, recorded in the zoom history. */
	applyRange(
		kind: "x" | "y",
		id: string,
		range: { min: number; max: number },
	): void;
	/** Fits every plotted axis to its data, like the Fit All button. */
	fitAll(): void;
}

let current: ViewportCommands | null = null;

/** Returns the unregister function, a no-op once a newer chart registered. */
export function registerViewportCommands(
	commands: ViewportCommands,
): () => void {
	current = commands;
	return () => {
		if (current === commands) current = null;
	};
}

/** Runs `fn` against the mounted chart; false when no chart is mounted. */
export function runViewportCommand(
	fn: (commands: ViewportCommands) => void,
): boolean {
	if (!current) return false;
	fn(current);
	return true;
}
