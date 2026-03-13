import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'beacon';

export interface ChartColors {
  text: string;
  grid: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
  axisLine: string;
}

export interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
  chartColors: ChartColors;
}

const BEACON_CHART: ChartColors = {
  text:         '#a89a8a',
  grid:         '#1a2e4a',
  tooltipBg:    '#091528',
  tooltipText:  '#f5f0e8',
  tooltipBorder:'#d97706',
  axisLine:     '#1a2e4a',
};

const DARK_CHART: ChartColors = {
  text:         '#9ca3af',
  grid:         '#1a2744',
  tooltipBg:    '#0d1428',
  tooltipText:  '#ffffff',
  tooltipBorder:'#1a2744',
  axisLine:     '#1a2744',
};

const LIGHT_CHART: ChartColors = {
  text:         '#4B5563',
  grid:         '#E5E7EB',
  tooltipBg:    '#ffffff',
  tooltipText:  '#1A1A2E',
  tooltipBorder:'#D1D5DB',
  axisLine:     '#E5E7EB',
};

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  isDark: true,
  toggle: () => {},
  chartColors: DARK_CHART,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Read initial theme: localStorage override → system pref → default dark */
export function getInitialTheme(): Theme {
  try {
    const override = localStorage.getItem('jarvis-theme-override');
    if (override === 'light' || override === 'dark' || override === 'beacon') return override;
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch { /* SSR guard */ }
  return 'dark';
}

/** Apply theme to <html> element */
export function applyThemeToDOM(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('dark', 'beacon');
  if (theme === 'dark') root.classList.add('dark');
  if (theme === 'beacon') root.classList.add('beacon');
}

/** Build ThemeContextValue for a given theme string */
export function buildThemeValue(
  theme: Theme,
  toggle: () => void
): ThemeContextValue {
  const chartColors =
    theme === 'dark' ? DARK_CHART :
    theme === 'beacon' ? BEACON_CHART :
    LIGHT_CHART;
  return {
    theme,
    isDark: theme !== 'light',
    toggle,
    chartColors,
  };
}

/** Hook for use inside ThemeProvider — manages actual state */
export function useThemeState() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Apply to DOM whenever theme changes
  useEffect(() => {
    applyThemeToDOM(theme);
    try { localStorage.setItem('jarvis-theme-override', theme); } catch { /* ignore */ }
  }, [theme]);

  // Cycles: dark → light → beacon → dark
  const toggle = useCallback(() => {
    setTheme(prev =>
      prev === 'dark' ? 'light' :
      prev === 'light' ? 'beacon' :
      'dark'
    );
  }, []);

  return { theme, toggle };
}
