/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      height: {
        'chat-input-min': '64px',
        'chat-input-max': '200px',
      },
    },
  },
  plugins: [],
}

