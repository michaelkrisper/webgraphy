import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatFullDate, generateTimeTicks, getTimeStep } from '../time';

describe('formatFullDate', () => {
    let originalTz: string | undefined;

    beforeAll(() => {
        originalTz = process.env.TZ;
        process.env.TZ = 'UTC';
    });

    afterAll(() => {
        process.env.TZ = originalTz;
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
    let originalTz: string | undefined;

    beforeAll(() => {
        originalTz = process.env.TZ;
        process.env.TZ = 'UTC';
    });

    afterAll(() => {
        process.env.TZ = originalTz;
    });

    it('generates ticks for seconds', () => {
        // We use { unit: 'second', value: 2 }, min = 0, max = 10
        // Expected ticks: -2 (margin), 0, 2, 4, 6, 8, 10, 12 (margin)
        const ticks = generateTimeTicks(0, 10, { unit: 'second', value: 2 });
        expect(ticks.map(t => t.timestamp)).toEqual([-2, 0, 2, 4, 6, 8, 10, 12]);
        expect(ticks.map(t => t.label)).toEqual([
            '23:59:58', '00:00:00', '00:00:02', '00:00:04',
            '00:00:06', '00:00:08', '00:00:10', '00:00:12'
        ]);
    });

    it('generates ticks for minutes', () => {
        // We use { unit: 'minute', value: 1 }, min = 0, max = 120 (2 minutes)
        // Expected ticks: -60 (margin), 0, 60, 120, 180 (margin)
        const ticks = generateTimeTicks(0, 120, { unit: 'minute', value: 1 });
        expect(ticks.map(t => t.timestamp)).toEqual([-60, 0, 60, 120, 180]);
        expect(ticks.map(t => t.label)).toEqual([
            '23:59', '00:00', '00:01', '00:02', '00:03'
        ]);
    });

    it('generates ticks for hours', () => {
        // We use { unit: 'hour', value: 1 }, min = 0, max = 7200 (2 hours)
        // Expected ticks: -3600 (margin), 0, 3600, 7200, 10800 (margin)
        const ticks = generateTimeTicks(0, 7200, { unit: 'hour', value: 1 });
        expect(ticks.map(t => t.timestamp)).toEqual([-3600, 0, 3600, 7200, 10800]);
        expect(ticks.map(t => t.label)).toEqual([
            '23:00', '00:00', '01:00', '02:00', '03:00'
        ]);
    });

    it('generates ticks for days', () => {
        // We use { unit: 'day', value: 1 }, min = 0, max = 86400 * 2 (2 days)
        // Expected ticks: -86400 (margin), 0, 86400, 172800, 259200 (margin)
        const ticks = generateTimeTicks(0, 86400 * 2, { unit: 'day', value: 1 });
        expect(ticks.map(t => t.timestamp)).toEqual([-86400, 0, 86400, 172800, 259200]);
        expect(ticks.map(t => t.label)).toEqual([
            '31.12.', '01.01.', '02.01.', '03.01.', '04.01.'
        ]);
    });

    it('generates ticks for weeks', () => {
        // We use { unit: 'week', value: 1 }, min = 0, max = 86400 * 14 (2 weeks)
        // Expected ticks: -864000 (margin), -259200, 345600, 950400, 1555200 (margin)
        const ticks = generateTimeTicks(0, 86400 * 14, { unit: 'week', value: 1 });
        expect(ticks.map(t => t.timestamp)).toEqual([-864000, -259200, 345600, 950400, 1555200]);
        expect(ticks.map(t => t.label)).toEqual([
            '22.12.', '29.12.', '5.1.', '12.1.', '19.1.'
        ]);
    });

    it('generates ticks for months', () => {
        // We use { unit: 'month', value: 1 }, min = 0, max = 86400 * 60 (~2 months)
        // Expected ticks: -2678400 (margin), 0, 2678400, 5097600, 7776000 (margin)
        const ticks = generateTimeTicks(0, 86400 * 60, { unit: 'month', value: 1 });
        expect(ticks.map(t => t.timestamp)).toEqual([-2678400, 0, 2678400, 5097600, 7776000]);
        expect(ticks.map(t => t.label)).toEqual([
            'Dez', 'Jan', 'Feb', 'Mär', 'Apr'
        ]);
    });

    it('generates ticks for years', () => {
        // We use { unit: 'year', value: 1 }, min = 0, max = 86400 * 365 * 2 (2 years)
        // Expected ticks: -31536000 (margin), 0, 31536000, 63072000, 94694400 (margin)
        const ticks = generateTimeTicks(0, 86400 * 365 * 2, { unit: 'year', value: 1 });
        expect(ticks.map(t => t.timestamp)).toEqual([-31536000, 0, 31536000, 63072000, 94694400]);
        expect(ticks.map(t => t.label)).toEqual([
            '1969', '1970', '1971', '1972', '1973'
        ]);
    });

    it('limits the number of ticks to max 501', () => {
        const ticks = generateTimeTicks(0, 10000, { unit: 'second', value: 1 });
        expect(ticks.length).toBe(501);
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
