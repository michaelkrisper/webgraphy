import { describe, it, expect, beforeAll } from 'vitest';
import { formatFullDate, getTimeStep } from '../time';

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

describe('getTimeStep', () => {
    it('returns a suitable step in seconds for a small range', () => {
        // range of 60 seconds, max 10 ticks -> ideal step 6s
        // next available in TIME_STEPS is 10s
        expect(getTimeStep(60, 10)).toEqual({ unit: 'second', value: 10 });
    });

    it('returns a suitable step in minutes for a medium range', () => {
        // range of 3600 seconds (1 hour), max 10 ticks -> ideal step 360s (6 mins)
        // next available is 10 mins
        expect(getTimeStep(3600, 10)).toEqual({ unit: 'minute', value: 10 });
    });

    it('returns a suitable step in hours for a longer range', () => {
        // range of 86400 seconds (1 day), max 10 ticks -> ideal step 8640s (2.4 hours)
        // next available is 3 hours
        expect(getTimeStep(86400, 10)).toEqual({ unit: 'hour', value: 3 });
    });

    it('returns a suitable step in days for a multi-day range', () => {
        // range of 7 * 86400 (1 week), max 5 ticks -> ideal step 120960s (1.4 days)
        // next available is 2 days
        expect(getTimeStep(7 * 86400, 5)).toEqual({ unit: 'day', value: 2 });
    });

    it('returns a suitable step in weeks/months', () => {
        // range of 30 * 86400 (1 month), max 5 ticks -> ideal step 6 days
        // next available is 1 week
        expect(getTimeStep(30 * 86400, 5)).toEqual({ unit: 'week', value: 1 });

        // range of 365 * 86400 (1 year), max 12 ticks -> ideal step ~30.4 days
        // idealStep is 2628000, 1 month is 2592000, so next available is 2 months
        expect(getTimeStep(365 * 86400, 12)).toEqual({ unit: 'month', value: 2 });
    });

    it('returns a suitable step in years for a very long range', () => {
        // range of 10 * 365 * 86400 (10 years), max 5 ticks -> ideal step 2 years
        // next available is 2 years
        expect(getTimeStep(10 * 365 * 86400, 5)).toEqual({ unit: 'year', value: 2 });
    });

    it('returns the exact step if it matches an available step', () => {
        // range of 100 seconds, max 10 ticks -> ideal step 10s
        expect(getTimeStep(100, 10)).toEqual({ unit: 'second', value: 10 });
    });

    it('returns the largest available step if the ideal step exceeds all options', () => {
        // range of 1000 years, max 5 ticks -> ideal step 200 years
        // max step in TIME_STEPS is 100 years
        expect(getTimeStep(1000 * 365 * 86400, 5)).toEqual({ unit: 'year', value: 100 });
    });
});
