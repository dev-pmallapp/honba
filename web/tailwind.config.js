/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tv: {
          primary: "#131722",
          secondary: "#1e222d",
          tertiary: "#2a2e39",
          elevated: "#363a45",
          border: "#2a2e39",
          accent: "#2962ff",
          "accent-hover": "#1e53e5",
          bullish: "#089981",
          bearish: "#f23645",
          text: "#d1d4dc",
          muted: "#787b86",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Trebuchet MS", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
}
