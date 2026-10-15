import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";
import { resolveAppVersion } from "./appVersion.ts";

export default defineConfig(({ mode }) => ({
	define: {
		__APP_VERSION__: JSON.stringify(resolveAppVersion()),
	},
	plugins: [
		react(),
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: null,
		}),
	],
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["src/__tests__/setup.ts"],
		// e2e/ holds Playwright specs. They match Vitest's default *.spec
		// pattern but must only ever run under `npx playwright test`.
		exclude: ["**/node_modules/**", "dist/**", "e2e/**", ".claude/**"],
		benchmark: {
			include: ["src/**/*.bench.ts"],
			// The warning works by wrapping every module export getter in a
			// counting closure (Map lookup + string key per access), which made
			// the hot-path benchmarks 2-5x slower against the control and would
			// fail the baseline gate on measurement overhead alone.
			suppressExportGetterWarnings: true,
		},
		// Benchmark files must not run concurrently: parallel workers compete
		// for CPU and memory bandwidth, so each file measures the others'
		// contention rather than its own code. Plain tests stay parallel.
		fileParallelism: mode !== "benchmark",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules", "dist", "e2e"],
			// Kept just under the current actuals so coverage can only go up.
			// Ratchet these when they rise; never lower them.
			thresholds: {
				statements: 91,
				branches: 80,
				functions: 86,
				lines: 92,
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "./src"),
			"virtual:pwa-register": path.resolve(
				import.meta.dirname,
				"src/__tests__/mock-pwa-register.ts",
			),
		},
	},
}));
