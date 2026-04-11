## 2026-04-05 - [localStorage Parsing Denial of Service]
**Vulnerability:** The application blindly parsed `localStorage` state using `JSON.parse` without error handling. If a malicious actor or extension corrupted the `webgraphy-state` item with invalid JSON, the resulting `SyntaxError` would crash the application on initialization (Client-Side DoS).
**Learning:** Client-side storage (localStorage, sessionStorage, IndexedDB) must be treated as untrusted input. It can be modified externally or corrupted.
**Prevention:** Always wrap `JSON.parse` operations on client-side storage within a `try...catch` block. Handle the error gracefully by returning a safe default (e.g., `null`) and logging the event without exposing stack traces to the user interface.
## 2026-04-11 - [Export PNG Memory Leak]
**Vulnerability:** In `exportToPNG`, a Blob URL is generated from the generated SVG to render on a canvas but `img.onerror` was not handled. If the SVG fails to load (e.g. malformed markup), the image will not trigger `img.onload`, the Promise won't resolve or reject, and the Object URL will never be revoked, leading to an unhandled promise rejection and a memory leak (Client-side DoS pattern).
**Learning:** When using object URLs (`URL.createObjectURL`), ensure they are reliably revoked by handling all completion paths (success and error).
**Prevention:** Always add `.onerror` handlers alongside `.onload` handlers when generating URLs from Blobs and revoke them consistently in all code paths.
