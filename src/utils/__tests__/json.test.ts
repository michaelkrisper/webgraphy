/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { secureJSONParse, JSONParseError } from "../json";

describe("JSONParseError", () => {
	it("should create an error with message and name", () => {
		const error = new JSONParseError("test message");
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("JSONParseError");
		expect(error.message).toBe("test message");
		expect(error.cause).toBeUndefined();
	});

	it("should create an error with options", () => {
		const cause = new Error("cause error");
		const error = new JSONParseError("test message", { cause });
		expect(error.cause).toBe(cause);
	});
});

describe("secureJSONParse", () => {
	it("should parse valid JSON", () => {
		const json = '{"a": 1, "b": "test", "c": [1, 2, 3]}';
		const result = secureJSONParse(json);
		expect(result).toEqual({ a: 1, b: "test", c: [1, 2, 3] });
	});

	it("should filter out __proto__ key", () => {
		const json = '{"a": 1, "__proto__": {"polluted": "yes"}}';
		const result = secureJSONParse(json) as any;
		expect(result).toEqual({ a: 1 });
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		// In JS, result.__proto__ is still the Object prototype, but it shouldn't have been polluted.
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it("should filter out prototype key", () => {
		const json = '{"a": 1, "prototype": {"polluted": "yes"}}';
		const result = secureJSONParse(json);
		expect(result).toEqual({ a: 1 });
		expect((result as Record<string, unknown>).prototype).toBeUndefined();
	});

	it("should filter out constructor key", () => {
		const json = '{"a": 1, "constructor": {"prototype": {"polluted": "yes"}}}';
		const result = secureJSONParse(json);
		expect(result).toEqual({ a: 1 });
		expect(result.constructor).toBe(Object);
	});

	it("should filter out dangerous keys in nested objects", () => {
		const json = '{"nested": {"__proto__": {"polluted": "yes"}, "valid": 123}}';
		const result = secureJSONParse(json);
		expect((result as Record<string, unknown>).nested).toEqual({ valid: 123 });
		expect(
			(result as Record<string, Record<string, unknown>>).nested.__proto__,
		).not.toHaveProperty("polluted");
	});

	it("should filter out dangerous keys in arrays", () => {
		const json = '[{"__proto__": {"polluted": "yes"}}, {"valid": 1}]';
		const result = secureJSONParse(json);
		expect(result).toEqual([{}, { valid: 1 }]);
	});

	it("should filter out dangerous keys in deeply nested structures", () => {
		// Note: We use computed property names or raw strings because JSON.stringify
		// skips __proto__ when defined directly in an object literal.
		const json = JSON.stringify({
			level1: {
				["__proto__"]: { polluted: "level1" },
				level2: [
					{
						constructor: { prototype: { polluted: "level2" } },
						valid: true,
					},
					{
						prototype: { polluted: "level2_alt" },
						nested: {
							["__proto__"]: { polluted: "level3" },
						},
					},
				],
			},
		});
		const result = secureJSONParse(json) as any;
		expect(result.level1.__proto__).not.toHaveProperty("polluted");
		expect(result.level1.level2[0].constructor).toBe(Object);
		expect(result.level1.level2[0].valid).toBe(true);
		expect(result.level1.level2[1].prototype).toBeUndefined();
		expect(result.level1.level2[1].nested.__proto__).not.toHaveProperty(
			"polluted",
		);

		// Check global state
		expect(({} as any).polluted).toBeUndefined();
	});

	it("should throw error for invalid JSON", () => {
		const json = '{"invalid": }';
		expect(() => secureJSONParse(json)).toThrow(JSONParseError);

		try {
			secureJSONParse(json);
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JSONParseError);
			expect((error as JSONParseError).name).toBe("JSONParseError");
			expect((error as JSONParseError).cause).toBeInstanceOf(SyntaxError);
			expect((error as JSONParseError).message).toContain("Unexpected");
		}
	});

	it("should map standard Error objects to JSONParseError with the same message", () => {
		const originalParse = JSON.parse;
		JSON.parse = vi.fn().mockImplementation(() => {
			throw new Error("Custom parsing error");
		});

		try {
			secureJSONParse('{"test": 1}');
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JSONParseError);
			expect((error as JSONParseError).message).toBe("Custom parsing error");
			expect((error as JSONParseError).cause).toBeInstanceOf(Error);
		} finally {
			JSON.parse = originalParse;
		}
	});

	it("should fallback to default error message if thrown value is not an Error", () => {
		// Mock JSON.parse to throw a string instead of an Error object
		const originalParse = JSON.parse;
		JSON.parse = vi.fn().mockImplementation(() => {
			throw "String error";
		});

		try {
			secureJSONParse('{"test": 1}');
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JSONParseError);
			expect((error as JSONParseError).message).toBe("Invalid JSON");
			expect((error as JSONParseError).cause).toBe("String error");
		} finally {
			JSON.parse = originalParse;
		}
	});

	it("should handle null thrown values gracefully", () => {
		const originalParse = JSON.parse;
		JSON.parse = vi.fn().mockImplementation(() => {
			throw null;
		});

		try {
			secureJSONParse('{"test": 1}');
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JSONParseError);
			expect((error as JSONParseError).message).toBe("Invalid JSON");
			expect((error as JSONParseError).cause).toBe(null);
		} finally {
			JSON.parse = originalParse;
		}
	});
});
