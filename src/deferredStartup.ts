// Startup work that first paint does not wait for. main.tsx imports this
// lazily so the service-worker glue and the analytics beacon stay out of the
// entry chunk.
import { registerServiceWorker } from "./registerServiceWorker";
import { countPageview } from "./services/analytics";

export function runDeferredStartup(): void {
	registerServiceWorker();
	countPageview();
}
