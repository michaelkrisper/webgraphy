// Startup work that first paint does not wait for. main.tsx imports this
// lazily so the service-worker glue, the analytics beacon and the WebMCP
// feature check stay out of the entry chunk.
import { registerServiceWorker } from "./registerServiceWorker";
import { countPageview } from "./services/analytics";
import { startWebMcp } from "./services/webmcp/detect";

export function runDeferredStartup(): void {
	registerServiceWorker();
	countPageview();
	startWebMcp();
}
