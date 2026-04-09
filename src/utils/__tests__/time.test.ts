import { describe, it, expect, beforeAll } from 'vitest';
import { formatFullDate, generateTimeTicks } from '../time';

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

describe('generateTimeTicks', () => {
    beforeAll(() => {
        process.env.TZ = 'UTC';
    });

    const BASE_TS = 1673784000; // 2023-01-15 12:00:00 UTC

    it('generates ticks for seconds', () => {
        const ticks = generateTimeTicks(BASE_TS, BASE_TS + 10, { unit: 'second', value: 5 });
        expect(ticks).toEqual([
            { timestamp: 1673783995, label: '11:59:55' },
            { timestamp: 1673784000, label: '12:00:00' },
            { timestamp: 1673784005, label: '12:00:05' },
            { timestamp: 1673784010, label: '12:00:10' },
            { timestamp: 1673784015, label: '12:00:15' }
        ]);
    });

    it('generates ticks for minutes', () => {
        const ticks = generateTimeTicks(BASE_TS, BASE_TS + 120, { unit: 'minute', value: 1 });
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks[1]).toEqual({ timestamp: BASE_TS, label: '12:00' });
    });

    it('generates ticks for hours', () => {
        const ticks = generateTimeTicks(BASE_TS, BASE_TS + 3600 * 2, { unit: 'hour', value: 2 });
        expect(ticks).toContainEqual({ timestamp: BASE_TS, label: '12:00' });
        expect(ticks).toContainEqual({ timestamp: BASE_TS + 7200, label: '14:00' });
    });

    it('generates ticks for days', () => {
        const ticks = generateTimeTicks(BASE_TS, BASE_TS + 86400 * 2, { unit: 'day', value: 1 });
        expect(ticks).toContainEqual({ timestamp: 1673740800, label: '15.01.' });
    });

    it('generates ticks for weeks', () => {
        const ticks = generateTimeTicks(BASE_TS, BASE_TS + 86400 * 14, { unit: 'week', value: 1 });
        expect(ticks).toContainEqual({ timestamp: 1673222400, label: '9.1.' });
    });

    it('generates ticks for months', () => {
        const ticks = generateTimeTicks(BASE_TS, BASE_TS + 86400 * 60, { unit: 'month', value: 1 });
        expect(ticks[1].timestamp).toBe(1672531200);
        expect(ticks[1].label).toMatch(/Jan/);
    });

    it('generates ticks for years', () => {
        const ticks = generateTimeTicks(BASE_TS, BASE_TS + 86400 * 365 * 2, { unit: 'year', value: 1 });
        expect(ticks[1].timestamp).toBe(1672531200);
        expect(ticks[1].label).toBe('2023');
    });

    it('limits the number of ticks to max 501', () => {
        const ticks = generateTimeTicks(0, 10000, { unit: 'second', value: 1 });
        expect(ticks.length).toBe(501);
    });
});
