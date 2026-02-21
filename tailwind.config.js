/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'arc-blue': '#555555',
        gold: '#888888',
        'caesar-red': '#333333',
        navy: {
          950: '#080808',
          900: '#0c0c0c',
          800: '#111111',
          700: '#1a1a1a',
          600: '#222222',
          500: '#2a2a2a',
        },
      },
      fontFamily: {
        sans: ["'Times New Roman'", 'Times', 'Georgia', 'serif'],
        serif: ["'Times New Roman'", 'Times', 'Georgia', 'serif'],
        mono: ["'Times New Roman'", 'Times', 'Georgia', 'serif'],
      },
      boxShadow: {
        'glow-gold': '0 0 0 2px rgba(128,128,128,0.3)',
        'glow-blue': '0 0 0 2px rgba(128,128,128,0.3)',
        'glow-red':  '0 0 0 2px rgba(64,64,64,0.4)',
        'card':      '0 2px 12px rgba(0,0,0,0.5)',
        'card-light':'0 1px 4px rgba(0,0,0,0.08)',
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
