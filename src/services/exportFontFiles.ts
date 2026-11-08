import comicNeue400 from "@fontsource/comic-neue/files/comic-neue-latin-400-normal.woff2?url";
import comicNeue700 from "@fontsource/comic-neue/files/comic-neue-latin-700-normal.woff2?url";
import plexSans400 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url";
import plexSans700 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2?url";
import jetbrains400 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url";
import jetbrains600 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2?url";
import serif400 from "@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2?url";
import serif600 from "@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2?url";

export interface FontFile {
	weight: number;
	url: string;
}

/**
 * The woff2 files of each theme font, by family: regular plus the weight bold
 * text resolves to among the ones fonts-<set>.css declares. These are the
 * same hashed assets the theme loads, so they add nothing to the build, and
 * the service worker serves them offline: IBM Plex (the default "light"
 * export theme) from the precache, the others once their theme has been used
 * (pwaWorkbox.ts). A file that cannot be fetched leaves the export on the
 * theme's fallback fonts (exportFonts.ts).
 */
export const FONT_FILES: Record<string, FontFile[]> = {
	"IBM Plex Sans": [
		{ weight: 400, url: plexSans400 },
		{ weight: 700, url: plexSans700 },
	],
	"JetBrains Mono": [
		{ weight: 400, url: jetbrains400 },
		{ weight: 600, url: jetbrains600 },
	],
	"Source Serif 4": [
		{ weight: 400, url: serif400 },
		{ weight: 600, url: serif600 },
	],
	"Comic Neue": [
		{ weight: 400, url: comicNeue400 },
		{ weight: 700, url: comicNeue700 },
	],
};
