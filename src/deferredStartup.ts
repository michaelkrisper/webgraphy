// Startup work that first paint does not wait for. main.tsx imports this
// lazily so the service-worker glue and the WebMCP feature check
// stay out of the entry chunk.
import { registerServiceWorker } from "./registerServiceWorker";
import { startWebMcp } from "./services/webmcp/detect";

export function runDeferredStartup(): void {
	registerServiceWorker();
	startWebMcp();
}
