/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        gradient: {
          start: '#0f0f23',
          middle: '#1a1a2e',
          end: '#16213e',
          accent: '#2d3561',
          highlight: '#4a5568',
        },
      },
      backgroundImage: {
        'dark-gradient': 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 35%, #16213e 100%)',
        'dark-gradient-radial': 'radial-gradient(circle at top right, #0f0f23 0%, #1a1a2e 40%, #16213e 100%)',
        'dark-gradient-subtle': 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
      },
      boxShadow: {
        'gradient-glow': '0 0 20px rgba(45, 53, 97, 0.3)',
        'card-gradient': '0 4px 20px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};
