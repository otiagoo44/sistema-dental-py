/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './estrategia.html',
    './js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#08111C',
        panel: '#0F1E2E',
        ivory: '#F2EDE3',
        gold: '#C8A44A',
        'gold-light': '#E4C97A',
        mint: '#34C9AB',
        muted: '#6B7E95',
        'red-urgent': '#E84545',
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        body: ['Cabinet Grotesk', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
