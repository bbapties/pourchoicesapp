/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ivory: '#FDF6E3',
        charcoal: '#2F2F2F',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
}
