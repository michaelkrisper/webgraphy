import { describe, expect, it } from "vitest";
import { type JsonSchema, validateInput } from "../schema";

const schema: JsonSchema = {
	type: "object",
	properties: {
		name: { type: "string", minLength: 1, maxLength: 5 },
		code: { type: "string", pattern: "^[a-z]+$" },
		mode: { type: "string", enum: ["a", "b"] },
		count: { type: "integer", minimum: 1, maximum: 9 },
		ratio: { type: "number" },
		flag: { type: "boolean" },
		either: {
			anyOf: [
				{ type: "integer", minimum: 1, maximum: 3 },
				{ type: "string", enum: ["new"] },
			],
		},
	},
	required: ["name"],
	additionalProperties: false,
};

describe("validateInput", () => {
	it("accepts valid input and treats null as an omitted optional", () => {
		expect(validateInput(schema, { name: "ok" })).toBeNull();
		expect(
			validateInput(schema, {
				name: "ok",
				code: "abc",
				mode: "b",
				count: 9,
				ratio: -0.5,
				flag: false,
				either: "new",
			}),
		).toBeNull();
		expect(validateInput(schema, { name: "ok", count: null })).toBeNull();
	});

	it("names the offending argument", () => {
		expect(validateInput(schema, {})).toBe('Missing required property "name"');
		expect(validateInput(schema, { name: null })).toBe(
			'Missing required property "name"',
		);
		expect(validateInput(schema, { name: "" })).toBe('"name" must not be empty');
		expect(validateInput(schema, { name: "toolong" })).toBe(
			'"name" must be at most 5 characters',
		);
		expect(validateInput(schema, { name: "x", code: "A1" })).toMatch(
			/invalid format: \^\[a-z\]\+\$/,
		);
		expect(validateInput(schema, { name: "x", mode: "c" })).toBe(
			'"mode" must be one of "a", "b"',
		);
		expect(validateInput(schema, { name: "x", count: 0 })).toBe(
			'"count" must be an integer from 1 to 9',
		);
		expect(validateInput(schema, { name: "x", count: 2.5 })).toMatch(
			/"count" must be an integer/,
		);
		expect(validateInput(schema, { name: "x", ratio: Number.NaN })).toBe(
			'"ratio" must be a number',
		);
		expect(validateInput(schema, { name: "x", ratio: "1" })).toBe(
			'"ratio" must be a number',
		);
		expect(validateInput(schema, { name: "x", flag: "yes" })).toBe(
			'"flag" must be a boolean',
		);
		expect(validateInput(schema, { name: "x", either: 4 })).toBe(
			'"either" must be an integer from 1 to 3 or one of "new"',
		);
		expect(validateInput(schema, { name: "x", extra: 1 })).toMatch(
			/^Unknown property "extra". Allowed: name, code/,
		);
		expect(validateInput(schema, [])).toBe("Input must be a JSON object");
	});

	it("treats missing input as an empty object", () => {
		expect(
			validateInput({ type: "object", additionalProperties: false }, undefined),
		).toBeNull();
		expect(validateInput({ type: "object" }, { anything: 1 })).toBeNull();
		expect(
			validateInput({ type: "object", additionalProperties: false }, { a: 1 }),
		).toBe('Unknown property "a". This tool takes no input');
	});
});
