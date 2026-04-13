import { useState, useEffect } from 'react';
import { type ThemeName, THEME_CYCLE } from '../themes';

export function useTheme(): [ThemeName, () => void] {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const stored = localStorage.getItem('theme') as ThemeName | null;
    return THEME_CYCLE.includes(stored as ThemeName) ? (stored as ThemeName) : 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.dataset.theme = theme;
    // Keep dark class for any CSS that relies on it (plot-area background etc.)
    document.documentElement.classList.toggle('dark', theme === 'dark' || theme === 'matrix');
  }, [theme]);

  const cycle = () => setTheme(t => THEME_CYCLE[(THEME_CYCLE.indexOf(t) + 1) % THEME_CYCLE.length]);

  return [theme, cycle];
}
