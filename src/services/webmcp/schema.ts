// The browser hands tool input over unvalidated (the spec only requires a
// JSON object), so every call is checked against the same schema the agent
// was given. Covers exactly the JSON Schema subset the tools use.

export interface JsonSchema {
	type?: "object" | "string" | "number" | "integer" | "boolean";
	description?: string;
	properties?: Record<string, JsonSchema>;
	required?: readonly string[];
	additionalProperties?: false;
	enum?: readonly (string | number)[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	anyOf?: readonly JsonSchema[];
}

const list = (values: readonly unknown[]) =>
	values.map((v) => JSON.stringify(v)).join(", ");

function typeName(schema: JsonSchema): string {
	if (schema.anyOf) return schema.anyOf.map(typeName).join(" or ");
	if (schema.enum) return `one of ${list(schema.enum)}`;
	if (schema.type === "integer" && schema.minimum !== undefined)
		return `an integer from ${schema.minimum} to ${schema.maximum}`;
	return schema.type === "integer" ? "an integer" : `a ${schema.type}`;
}

function check(
	schema: JsonSchema,
	value: unknown,
	name: string,
): string | null {
	if (schema.anyOf) {
		return schema.anyOf.some((s) => check(s, value, name) === null)
			? null
			: `"${name}" must be ${typeName(schema)}`;
	}
	const wrongType = `"${name}" must be ${typeName(schema)}`;
	switch (schema.type) {
		case "object": {
			if (typeof value !== "object" || value === null || Array.isArray(value))
				return "Input must be a JSON object";
			const obj = value as Record<string, unknown>;
			const props = schema.properties ?? {};
			for (const key of Object.keys(obj)) {
				if (!(key in props) && schema.additionalProperties === false) {
					const allowed = Object.keys(props);
					return allowed.length
						? `Unknown property "${key}". Allowed: ${allowed.join(", ")}`
						: `Unknown property "${key}". This tool takes no input`;
				}
			}
			for (const key of schema.required ?? []) {
				if (obj[key] === undefined || obj[key] === null)
					return `Missing required property "${key}"`;
			}
			for (const [key, prop] of Object.entries(props)) {
				// Agents often send null for an optional argument they mean to skip.
				if (obj[key] === undefined || obj[key] === null) continue;
				const error = check(prop, obj[key], key);
				if (error) return error;
			}
			return null;
		}
		case "string": {
			if (typeof value !== "string") return wrongType;
			if (schema.minLength !== undefined && value.trim().length < schema.minLength)
				return `"${name}" must not be empty`;
			if (schema.maxLength !== undefined && value.length > schema.maxLength)
				return `"${name}" must be at most ${schema.maxLength} characters`;
			if (schema.pattern && !new RegExp(schema.pattern).test(value))
				return `"${name}" has an invalid format: ${schema.description ?? schema.pattern}`;
			break;
		}
		case "number":
		case "integer": {
			if (typeof value !== "number" || !Number.isFinite(value)) return wrongType;
			if (schema.type === "integer" && !Number.isInteger(value)) return wrongType;
			if (
				(schema.minimum !== undefined && value < schema.minimum) ||
				(schema.maximum !== undefined && value > schema.maximum)
			)
				return wrongType;
			break;
		}
		case "boolean":
			if (typeof value !== "boolean") return wrongType;
			break;
	}
	if (schema.enum && !schema.enum.includes(value as string | number))
		return `"${name}" must be one of ${list(schema.enum)}`;
	return null;
}

/** Null when `input` matches `schema`, else a message the agent can act on. */
export function validateInput(
	schema: JsonSchema,
	input: unknown,
): string | null {
	return check(schema, input ?? {}, "input");
}
