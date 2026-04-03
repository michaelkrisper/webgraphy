## Bolt Journal\n
## 2026-04-02 - O(N) Array.find() inside nested loops
**Learning:** Calling `Array.find()` on `columnConfigs` for every cell inside the nested data parsing loop (Rows x Columns) creates an O(R * C * Configs) complexity, noticeably degrading parsing performance for large files.
**Action:** Pre-calculate a lookup array (`configsByIndex`) mapping column indices to their configuration before starting the main parsing loop, reducing the inner loop check to O(1).
