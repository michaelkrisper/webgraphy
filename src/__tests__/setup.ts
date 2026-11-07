import { registerHooks } from "node:module";
import { expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

// The preact/compat aliases in vitest.config.ts only reach code Vite
// transforms. Dependencies Vitest externalises (@testing-library/react,
// lucide-react, zustand) are loaded by Node itself and would pull in the real
// React next to Preact, so redirect their imports here too. Preact ships ESM
// only, so require() and import share one instance of it.
const preactFor: Record<string, string> = {
	react: "preact/compat",
	"react/jsx-runtime": "preact/jsx-runtime",
	"react/jsx-dev-runtime": "preact/jsx-runtime",
	"react-dom": "preact/compat",
	"react-dom/client": "preact/compat/client",
	"react-dom/test-utils": "preact/test-utils",
};
const patched = Symbol.for("webgraphy.preactTestSetup");
if (!(patched in process)) {
	Object.defineProperty(process, patched, { value: true });
	registerHooks({
		resolve: (specifier, context, next) =>
			next(preactFor[specifier] ?? specifier, context),
	});

	// React's onChange listens to `input` and `change` alike; preact/compat
	// binds it to `input` on text fields (as it does for typing in a browser,
	// which fires both). Fire both, so fireEvent.change still means "the user
	// edited the field". Imported only now: the hook above must come first.
	const { fireEvent } = await import("@testing-library/react");
	const change = fireEvent.change;
	fireEvent.change = (node, init) => {
		const textField =
			node instanceof HTMLTextAreaElement ||
			(node instanceof HTMLInputElement && !/fil|che|rad/.test(node.type));
		if (!textField) return change(node, init);
		fireEvent.input(node, init);
		return change(node);
	};
}

// Browsers dispatch no clicks at a disabled form control (and React filtered
// them out of its handlers as well), but jsdom delivers synthetic ones and
// Preact's handlers are plain DOM listeners. Drop them as a browser would.
const disabledControl =
	"button:disabled, input:disabled, select:disabled, textarea:disabled";
for (const type of ["click", "dblclick", "mousedown", "mouseup"]) {
	window.addEventListener(
		type,
		(e) => {
			if (e.target instanceof Element && e.target.closest(disabledControl)) {
				e.stopImmediatePropagation();
			}
		},
		{ capture: true },
	);
}

// Register `toHaveNoViolations` globally so any component test can assert
// accessibility without repeating the wiring.
expect.extend(axeMatchers);

// Mock localStorage for tests (runs before module imports)
const localStorageMock = (() => {
	let store: Record<string, string> = {};

	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value.toString();
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
		key: (index: number) => {
			const keys = Object.keys(store);
			return keys[index] || null;
		},
		get length() {
			return Object.keys(store).length;
		},
	};
})();

Object.defineProperty(window, "localStorage", {
	value: localStorageMock,
	writable: true,
});
