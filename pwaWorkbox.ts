import type { VitePWAOptions } from "vite-plugin-pwa";

/** Workbox options of the service worker, pinned in pwaWorkbox.test.ts. */
export const workbox = {
	// Workbox's default globs omit woff2, which the default themes' fonts need.
	globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
	globIgnores: [
		// The Excel worker carries the whole spreadsheet library and is
		// only constructed on the first .xlsx import, which most sessions
		// never do. Precaching it would put that cost on every cold load,
		// so it is fetched on demand and cached from then on instead.
		"**/excel.worker-*.js",
		// Fonts likewise: only the default light/dark themes' set
		// (src/fonts-plex.css, IBM Plex) is precached. The other themes'
		// sets are fetched when the theme is first applied and cached from
		// then on ("webgraphy-theme-fonts" below); offline before that, the theme and
		// image exports in it fall back through its font stack.
		"**/fonts-{jetbrains,serif,comic}-*.css",
		"**/{jetbrains-mono,source-serif-4,comic-neue}-*.woff2",
		// The maskable icon and store screenshots are only read by the OS
		// install UI, never by the running app.
		"**/pwa-maskable-*.png",
		"**/screenshot-*.png",
	],
	runtimeCaching: [
		{
			urlPattern: /\/assets\/excel\.worker-.*\.js$/,
			handler: "CacheFirst",
			options: {
				cacheName: "webgraphy-excel-worker",
				expiration: { maxEntries: 2 },
			},
		},
		{
			// Every font asset the precache does not serve. The URLs are
			// content-hashed, so a hit never needs revalidating; the cap
			// drops the files a deploy replaced.
			urlPattern: /\/assets\/(?:fonts-[^/]+\.css|[^/]+\.woff2)$/,
			handler: "CacheFirst",
			options: {
				cacheName: "webgraphy-theme-fonts",
				expiration: { maxEntries: 24, maxAgeSeconds: 365 * 24 * 60 * 60 },
			},
		},
	],
} satisfies Partial<VitePWAOptions["workbox"]>;
