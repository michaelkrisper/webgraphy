import { expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

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
