/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#F4F7FB',
        panel: '#FFFFFF',
        cream: '#14213D',
        mint: '#2563EB',
        gold: '#B45309',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 34px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
