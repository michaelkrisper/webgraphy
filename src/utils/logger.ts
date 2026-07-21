// Central logging shim. Replaces scattered raw `console.error` calls so error
// output has a single choke point — level gating, silencing, or routing to
// telemetry can be added here without touching call sites. Dependency-free on
// purpose: safe to import from the framework-free WebGL renderer and workers.
export const logger = {
	error(message: string, ...detail: unknown[]): void {
		console.error(message, ...detail);
	},
	warn(message: string, ...detail: unknown[]): void {
		console.warn(message, ...detail);
	},
};
