import { describe, it, expect, beforeAll } from 'vitest';
import { formatFullDate } from '../time';

describe('formatFullDate', () => {
    beforeAll(() => {
        process.env.TZ = 'UTC';
    });

    it('removes fractional seconds if they are zero', () => {
        const ts = 1673784000; // 2023-01-15 12:00:00
        expect(formatFullDate(ts)).toBe('15.01.2023, 12:00:00');
    });

    it('keeps fractional seconds if they are non-zero', () => {
        const ts = 1673784000.123;
        expect(formatFullDate(ts)).toBe('15.01.2023, 12:00:00,123');
    });

    it('trims trailing zeros from fractional seconds', () => {
        const ts = 1673784000.120;
        expect(formatFullDate(ts)).toBe('15.01.2023, 12:00:00,12');
    });

    it('trims all trailing zeros but keeps the first decimal if specified, but here we trim all', () => {
        const ts = 1673784000.100;
        expect(formatFullDate(ts)).toBe('15.01.2023, 12:00:00,1');
    });
});
