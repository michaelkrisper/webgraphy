import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from '../useDarkMode';

describe('useDarkMode', () => {
  let getItemMock: ReturnType<typeof vi.fn>;
  let setItemMock: ReturnType<typeof vi.fn>;
  let removeItemMock: ReturnType<typeof vi.fn>;

  let originalLocalStorage: Storage;

  beforeEach(() => {
    originalLocalStorage = window.localStorage;

    getItemMock = vi.fn();
    setItemMock = vi.fn();
    removeItemMock = vi.fn();

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: getItemMock,
        setItem: setItemMock,
        removeItem: removeItemMock,
      },
      writable: true,
    });

    document.documentElement.className = '';
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('should initialize with false when localStorage is empty', () => {
    getItemMock.mockReturnValue(null);

    const { result } = renderHook(() => useDarkMode());

    expect(result.current[0]).toBe(false);
    expect(getItemMock).toHaveBeenCalledWith('darkMode');

    // useEffect will run and set the initial class and localStorage
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(setItemMock).toHaveBeenCalledWith('darkMode', 'false');
  });

  it('should initialize with true when localStorage has "true"', () => {
    getItemMock.mockReturnValue('true');

    const { result } = renderHook(() => useDarkMode());

    expect(result.current[0]).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(setItemMock).toHaveBeenCalledWith('darkMode', 'true');
  });

  it('should toggle dark mode state and update localStorage and document classes', () => {
    getItemMock.mockReturnValue('false');

    const { result } = renderHook(() => useDarkMode());

    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](); // toggle
    });

    expect(result.current[0]).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(setItemMock).toHaveBeenCalledWith('darkMode', 'true');

    act(() => {
      result.current[1](); // toggle again
    });

    expect(result.current[0]).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(setItemMock).toHaveBeenCalledWith('darkMode', 'false');
  });
});
