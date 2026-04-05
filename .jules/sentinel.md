## 2026-04-05 - [localStorage Parsing Denial of Service]
**Vulnerability:** The application blindly parsed `localStorage` state using `JSON.parse` without error handling. If a malicious actor or extension corrupted the `webgraphy-state` item with invalid JSON, the resulting `SyntaxError` would crash the application on initialization (Client-Side DoS).
**Learning:** Client-side storage (localStorage, sessionStorage, IndexedDB) must be treated as untrusted input. It can be modified externally or corrupted.
**Prevention:** Always wrap `JSON.parse` operations on client-side storage within a `try...catch` block. Handle the error gracefully by returning a safe default (e.g., `null`) and logging the event without exposing stack traces to the user interface.
