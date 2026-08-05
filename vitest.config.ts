import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";
import { resolveAppVersion } from "./appVersion";

export default defineConfig({
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
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules", "dist"],
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
			"@": path.resolve(__dirname, "./src"),
			"virtual:pwa-register": path.resolve(
				__dirname,
				"src/__tests__/mock-pwa-register.ts",
			),
		},
	},
});
