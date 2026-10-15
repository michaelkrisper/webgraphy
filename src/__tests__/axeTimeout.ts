/**
 * Per-test timeout for tests that run an axe audit. A single audit walks the
 * whole rendered tree against every rule and can take several seconds on a
 * busy machine, which tripped Vitest's 5 s default; only these tests get the
 * longer budget so a genuinely hung test elsewhere still fails fast.
 */
export const AXE_TIMEOUT_MS = 30_000;
