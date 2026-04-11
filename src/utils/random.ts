/**
 * Provides a cryptographically secure random number between 0 (inclusive) and 1 (exclusive),
 * similar to Math.random(), but using the Web Crypto API.
 * Uses a buffer to maintain performance during high-frequency calls.
 */
const BUFFER_SIZE = 1024;
const buffer = new Uint32Array(BUFFER_SIZE);
let index = BUFFER_SIZE;

export function secureRandom(): number {
  if (index >= BUFFER_SIZE) {
    crypto.getRandomValues(buffer);
    index = 0;
  }
  // Divide by 2^32 to get a value in [0, 1)
  return buffer[index++] / 4294967296;
}
