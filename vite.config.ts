import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import { resolveAppVersion } from "./appVersion";

// Cross-origin isolation enables SharedArrayBuffer, which the render worker
// uses for the per-frame viewport handoff (falls back to postMessage without
// it). `credentialless` (not `require-corp`) keeps the cross-origin GoatCounter
// beacon loading; Safari lacks it and simply stays on the fallback path. GitHub
// Pages cannot set response headers, so production also uses the fallback.
const coiHeaders = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "credentialless",
};

// https://vite.dev/config/
export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(resolveAppVersion()),
	},
	server: { headers: coiHeaders },
	preview: { headers: coiHeaders },
	plugins: [
		{
			name: "dev-csp-plugin",
			apply: "serve",
			transformIndexHtml(html) {
				return html
					.replace(/script-src 'self';/g, "script-src 'self' 'unsafe-inline';")
					.replace(/style-src 'self'/g, "style-src 'self' 'unsafe-inline'");
			},
		},
		react(),
		// Opt-in bundle composition report: ANALYZE=1 npm run build
		...(process.env.ANALYZE
			? [
					visualizer({
						filename: "dist/bundle-report.html",
						gzipSize: true,
						brotliSize: true,
					}),
				]
			: []),
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: null,
			includeAssets: ["favicon.svg", "pwa-192x192.png", "pwa-512x512.png"],
			// Precache self-hosted fonts (default globs omit woff2) so every
			// theme's typography is available fully offline.
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
				// The Excel worker carries the whole spreadsheet library and is
				// only constructed on the first .xlsx import, which most sessions
				// never do. Precaching it would put that cost on every cold load,
				// so it is fetched on demand and cached from then on instead.
				globIgnores: ["**/excel.worker-*.js"],
				runtimeCaching: [
					{
						urlPattern: /\/assets\/excel\.worker-.*\.js$/,
						handler: "CacheFirst",
						options: {
							cacheName: "excel-worker",
							expiration: { maxEntries: 2 },
						},
					},
				],
			},
			manifest: {
				name: "WebGraphy",
				short_name: "WebGraphy",
				description:
					"Professional high-performance data visualization tool using WebGL.",
				theme_color: "#007bff",
				background_color: "#f8fafc",
				display: "standalone",
				icons: [
					{
						src: "pwa-192x192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any",
					},
				],
			},
		}),
	],
	base: "./",
	test: {
		environment: "jsdom",
		globals: true,
	},
});
