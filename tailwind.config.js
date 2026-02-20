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
        gold: '#FFD700',
        'arc-blue': '#00CFFF',
        'caesar-red': '#C0392B',
        navy: {
          950: '#05080f',
          900: '#080d1a',
          800: '#0d1428',
          700: '#121c35',
          600: '#1a2744',
          500: '#1e3055',
        },
        // Light-theme specific surfaces
        light: {
          bg:      '#F4F6F9',  // main background
          card:    '#FFFFFF',  // card surface
          sidebar: '#E8EBF0',  // sidebar / top bar
          elevated:'#ECEEF2',  // kanban columns, hover states
          border:  '#D1D5DB',  // subtle borders
          text:    '#1A1A2E',  // primary text
          muted:   '#6B7280',  // secondary text
          input:   '#FFFFFF',  // input backgrounds
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(255, 215, 0, 0.3)',
        'glow-blue': '0 0 20px rgba(0, 207, 255, 0.3)',
        'glow-red':  '0 0 20px rgba(192, 57, 43, 0.3)',
        'card':      '0 4px 24px rgba(0,0,0,0.4)',
        'card-light':'0 2px 12px rgba(0,0,0,0.08)',
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
