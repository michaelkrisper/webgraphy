import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
		consoleWarnSpy.mockRestore();
	});

	describe('error', () => {
		it('calls console.error with the provided message', () => {
			logger.error('An error occurred');
			expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred');
		});

		it('calls console.error with the provided message and details', () => {
			const errorObj = new Error('Test error');
			logger.error('An error occurred', { detail: 'something' }, errorObj);
			expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred', { detail: 'something' }, errorObj);
		});
	});

	describe('warn', () => {
		it('calls console.warn with the provided message', () => {
			logger.warn('A warning occurred');
			expect(consoleWarnSpy).toHaveBeenCalledWith('A warning occurred');
		});

		it('calls console.warn with the provided message and details', () => {
			logger.warn('A warning occurred', { detail: 'something' }, 42);
			expect(consoleWarnSpy).toHaveBeenCalledWith('A warning occurred', { detail: 'something' }, 42);
		});
	});
});
