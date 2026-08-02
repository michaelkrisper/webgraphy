import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

const text = "Hello \u00A9";
const encoded = new TextEncoder().encode(text);
const decoded = new TextDecoder().decode(encoded);

console.log(purify.sanitize(decoded));
