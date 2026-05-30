import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["src/__tests__/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules", "dist"],
			// Regression guard: thresholds sit just below the current numbers so
			// the suite fails if coverage drops meaningfully. Ratchet them up as
			// coverage improves.
			thresholds: {
				statements: 85,
				branches: 73,
				functions: 85,
				lines: 85,
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
