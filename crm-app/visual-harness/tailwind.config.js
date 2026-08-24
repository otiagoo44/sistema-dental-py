import baseConfig from '../tailwind.config.js';

export default {
  ...baseConfig,
  content: [
    './index.html',
    './main.jsx',
    '../src/**/*.{js,jsx}',
  ],
};
