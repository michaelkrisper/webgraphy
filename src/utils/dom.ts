/**
 * Escapes special characters in a string to prevent XSS when using innerHTML.
 * Handles common HTML special characters and also '=' which can be relevant in some contexts.
 */
export function escapeHTML(str: string | undefined | null): string {
	if (!str) return "";
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
		.replace(/=/g, "&#061;");
}
