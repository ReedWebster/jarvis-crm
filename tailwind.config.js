/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Class-based dark mode: add/remove `dark` on <html>
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutral accent replacing neon blue — focus rings, active indicators
        'arc-blue': '#737373',
        // Soft neutral replacing gold
        gold: '#a3a3a3',
        // Danger
        'caesar-red': '#dc2626',
        // Neutral dark grays (replaces navy)
        navy: {
          950: '#0c0c0c',
          900: '#111111',
          800: '#161616',
          700: '#1e1e1e',
          600: '#262626',
          500: '#2c2c2c',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-gold': '0 0 0 2px rgba(163,163,163,0.25)',
        'glow-blue': '0 0 0 2px rgba(115,115,115,0.25)',
        'glow-red':  '0 0 0 2px rgba(220,38,38,0.25)',
        'card':      '0 2px 12px rgba(0,0,0,0.5)',
        'card-light':'0 1px 6px rgba(0,0,0,0.07)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.3s ease-in-out',
        'slide-in':   'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
