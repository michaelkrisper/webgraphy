import type { Granularity } from "./types";
// ── Date-key helper (one source of truth) ──────────────────────────────────

/** Coerce a raw timestamp value into milliseconds since epoch. */
export function toMillis(t: number): number {
	if (t > 1e14) return t / 1000; // microseconds
	if (t > 1e11) return t; // milliseconds
	return t * 1000; // seconds
}


export function dateKey(d: Date, granularity: Granularity): string {
	const y = d.getFullYear();
	const mo = d.getMonth();
	const da = d.getDate();
	if (granularity === "day") return `${y}-${mo}-${da}`;
	const hr = d.getHours();
	if (granularity === "hour") return `${y}-${mo}-${da}-${hr}`;
	const mi = d.getMinutes();
	if (granularity === "minute") return `${y}-${mo}-${da}-${hr}-${mi}`;
	return `${y}-${mo}-${da}-${hr}-${mi}-${d.getSeconds()}`;
}

export const _scratchDate = new Date();
export function granularityOf(funcName: string): Granularity {
	if (funcName.endsWith("day")) return "day";
	if (funcName.endsWith("hour")) return "hour";
	if (funcName.endsWith("minute")) return "minute";
	return "second";
}
