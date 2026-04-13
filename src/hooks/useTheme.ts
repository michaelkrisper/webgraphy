import { useState, useEffect } from 'react';
import { type ThemeName, THEME_CYCLE, THEMES } from '../themes';

// Inject Inter from Google Fonts once — only for professional themes
let interLoaded = false;
function ensureInter() {
  if (interLoaded) return;
  interLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(link);
}

export function useTheme(): [ThemeName, () => void] {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const stored = localStorage.getItem('theme') as ThemeName | null;
    return THEME_CYCLE.includes(stored as ThemeName) ? (stored as ThemeName) : 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark' || theme === 'matrix');
    document.body.style.fontFamily = THEMES[theme].fontFamily;
    if (theme === 'light' || theme === 'dark') ensureInter();
  }, [theme]);

  const cycle = () => setTheme(t => THEME_CYCLE[(THEME_CYCLE.indexOf(t) + 1) % THEME_CYCLE.length]);

  return [theme, cycle];
}
