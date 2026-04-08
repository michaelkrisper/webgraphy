/**
 * Safely parses a JSON string, filtering out potentially dangerous keys
 * like __proto__ and constructor to prevent prototype pollution.
 */
export function secureJSONParse(text: string): any {
  return JSON.parse(text, (key, value) => {
    if (key === '__proto__' || key === 'constructor') {
      return undefined;
    }
    return value;
  });
}
