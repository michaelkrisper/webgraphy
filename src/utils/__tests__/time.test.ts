import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatFullDate, generateTimeTicks, getTimeStep, generateSecondaryLabels, formatPrimaryLabel } from '../time';


describe('formatPrimaryLabel', () => {
    it('returns empty string for unknown unit', () => {
        expect(formatPrimaryLabel(0, 'unknown' as any)).toBe('');
    });
});

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
    it('generates ticks for multi-month steps', () => {
        const ticks = generateTimeTicks(0, 86400 * 180, { unit: 'month', value: 2 });
        expect(ticks.length).toBeGreaterThan(0);
    });

    it('generates ticks for multi-year steps', () => {
        const ticks = generateTimeTicks(0, 86400 * 365 * 5, { unit: 'year', value: 2 });
        expect(ticks.length).toBeGreaterThan(0);
    });

    it('generates ticks for multiple days aligning to start of month', () => {
        // We use { unit: 'day', value: 2 }, min = 0, max = 86400 * 4
        // Expected to hit line 95 (d.setDate(1))
        const ticks = generateTimeTicks(0, 86400 * 4, { unit: 'day', value: 2 });
        expect(ticks.length).toBeGreaterThan(0);
    });

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
    it('generates ticks for multiple days (value > 1)', () => {
        const ticks = generateTimeTicks(0, 86400 * 4, { unit: 'day', value: 2 });
        expect(ticks.map(t => t.timestamp)).toEqual([-172800, 0, 172800, 345600, 518400]);
        expect(ticks.map(t => t.label)).toEqual([
            '30.12.', '01.01.', '03.01.', '05.01.', '07.01.'
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
    it('returns empty label for unknown unit', () => {
        expect(formatPrimaryLabel(0, 'unknown' as any)).toBe('');
    });
});

describe('getTimeStep', () => {
    it('handles edge cases like 0 or negative values', () => {
        // range 0
        expect(getTimeStep(0, 10)).toEqual({ unit: 'second', value: 1 });
        // maxTicks 0 -> idealStep is Infinity
        expect(getTimeStep(100, 0)).toEqual({ unit: 'year', value: 100 });
        // negative range -> idealStep is negative
        expect(getTimeStep(-100, 10)).toEqual({ unit: 'second', value: 1 });
    });

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

describe('generateSecondaryLabels', () => {
    let originalTz: string | undefined;

    beforeAll(() => {
        originalTz = process.env.TZ;
        process.env.TZ = 'UTC';
    });

    afterAll(() => {
        process.env.TZ = originalTz;
    });

    it('generates day labels for second/minute/hour units', () => {
        // Range: 2023-01-15 12:00:00 to 2023-01-17 12:00:00
        const min = 1673784000;
        const max = 1673956800;

        const labels = generateSecondaryLabels(min, max, { unit: 'hour', value: 1 });

        // Expected labels: 14.01.2023, 15.01.2023, 16.01.2023, 17.01.2023, 18.01.2023
        expect(labels.length).toBeGreaterThan(0);

        // Ensure format is DD.MM.YYYY
        expect(labels[0].label).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);

        // Check exact timestamps (midnight UTC)
        // 14.01.2023 00:00:00 UTC = 1673654400
        expect(labels[0].timestamp).toBe(1673654400);
        expect(labels[1].timestamp).toBe(1673740800);
    });

    it('generates year labels for day/week/month/year units', () => {
        // Range: 2023-01-15 to 2025-01-15
        const min = 1673740800;
        const max = 1736899200;

        const labels = generateSecondaryLabels(min, max, { unit: 'month', value: 1 });

        expect(labels.length).toBeGreaterThan(0);

        // Expected labels: 2022, 2023, 2024, 2025, 2026
        expect(labels.map(l => l.label)).toEqual(['2022', '2023', '2024', '2025', '2026']);

        // 2022-01-01 00:00:00 UTC = 1640995200
        expect(labels[0].timestamp).toBe(1640995200);
        // 2023-01-01 00:00:00 UTC = 1672531200
        expect(labels[1].timestamp).toBe(1672531200);
    });


    it('generates day labels when unit is second', () => {
        const min = 1673784000;
        const max = 1673870400; // +1 day
        const labels = generateSecondaryLabels(min, max, { unit: 'second', value: 30 });
        expect(labels.length).toBeGreaterThan(0);
        expect(labels[0].label).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
        expect(labels[0].timestamp).toBe(1673654400); // 2023-01-14 (margin)
    });

    it('generates day labels when unit is minute', () => {
        const min = 1673784000;
        const max = 1673870400; // +1 day
        const labels = generateSecondaryLabels(min, max, { unit: 'minute', value: 15 });
        expect(labels.length).toBeGreaterThan(0);
        expect(labels[0].label).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
        expect(labels[0].timestamp).toBe(1673654400); // 2023-01-14 (margin)
    });

    it('generates year labels when unit is day', () => {
        const min = 1673740800; // 2023-01-15
        const max = 1705276800; // 2024-01-15
        const labels = generateSecondaryLabels(min, max, { unit: 'day', value: 1 });
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.map(l => l.label)).toEqual(['2022', '2023', '2024', '2025']);
        expect(labels[0].timestamp).toBe(1640995200); // 2022-01-01
    });

    it('generates year labels when unit is week', () => {
        const min = 1673740800; // 2023-01-15
        const max = 1705276800; // 2024-01-15
        const labels = generateSecondaryLabels(min, max, { unit: 'week', value: 2 });
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.map(l => l.label)).toEqual(['2022', '2023', '2024', '2025']);
    });

    it('generates year labels when unit is year', () => {
        const min = 1673740800; // 2023-01-15
        const max = 1705276800; // 2024-01-15
        const labels = generateSecondaryLabels(min, max, { unit: 'year', value: 1 });
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.map(l => l.label)).toEqual(['2022', '2023', '2024', '2025']);
    });

    it('caps the number of labels to prevent infinite loops (hour unit)', () => {
        const min = 1673784000; // 2023-01-15
        const max = 1673784000 + (200 * 86400); // +200 days

        const labels = generateSecondaryLabels(min, max, { unit: 'hour', value: 1 });

        // loop breaks when labels.length > 100, which means length becomes 101
        expect(labels.length).toBe(101);
    });

    it('caps the number of labels to prevent infinite loops (month unit)', () => {
        const min = 1673784000; // 2023
        const max = 1673784000 + (200 * 31536000); // +200 years (approx)

        const labels = generateSecondaryLabels(min, max, { unit: 'month', value: 1 });

        expect(labels.length).toBe(101);
    });
});
