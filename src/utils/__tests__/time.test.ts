import { describe, it, expect, beforeAll } from 'vitest';
import { formatFullDate, generateSecondaryLabels } from '../time';

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

describe('generateSecondaryLabels', () => {
    beforeAll(() => {
        process.env.TZ = 'UTC';
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
