import { describe, expect, it } from "vitest";
import { escapeHTML } from "../dom";

describe("escapeHTML", () => {
	it("should escape special HTML characters", () => {
		const input = '<script>alert("XSS & risk")</script>';
		const expected =
			"&lt;script&gt;alert(&quot;XSS &amp; risk&quot;)&lt;/script&gt;";
		expect(escapeHTML(input)).toBe(expected);
	});

	it("should escape single quotes", () => {
		const input = "It's a test";
		const expected = "It&#039;s a test";
		expect(escapeHTML(input)).toBe(expected);
	});

	it("should escape backticks", () => {
		const input = "Template `literal` injection";
		const expected = "Template &#x60;literal&#x60; injection";
		expect(escapeHTML(input)).toBe(expected);
	});

	it("should handle strings without special characters", () => {
		const input = "Normal string 123";
		expect(escapeHTML(input)).toBe(input);
	});

	it("should handle empty strings", () => {
		expect(escapeHTML("")).toBe("");
	});

	it("should handle null and undefined", () => {
		expect(escapeHTML(null)).toBe("");
		expect(escapeHTML(undefined)).toBe("");
	});
});
