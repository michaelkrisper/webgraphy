export class JSONParseError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "JSONParseError";
	}
}

/**
 * Safely parses a JSON string, filtering out potentially dangerous keys
 * like __proto__ and constructor to prevent prototype pollution.
 */
export function secureJSONParse(text: string): unknown {
	try {
		return JSON.parse(text, (key, value) => {
			if (key === "__proto__" || key === "constructor" || key === "prototype") {
				return undefined;
			}
			return value;
		});
	} catch (error) {
		throw new JSONParseError(
			error instanceof Error ? error.message : "Invalid JSON",
			{ cause: error },
		);
	}
}
