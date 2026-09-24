/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tv: {
          primary: "var(--tv-bg-primary)",
          secondary: "var(--tv-bg-secondary)",
          tertiary: "var(--tv-bg-tertiary)",
          elevated: "var(--tv-bg-elevated)",
          border: "var(--tv-border)",
          accent: "var(--tv-accent)",
          "accent-hover": "var(--tv-accent-hover)",
          bullish: "var(--tv-bullish)",
          bearish: "var(--tv-bearish)",
          text: "var(--tv-text)",
          muted: "var(--tv-text-muted)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans, Inter)", "-apple-system", "BlinkMacSystemFont", "Trebuchet MS", "sans-serif"],
        mono: ["var(--font-mono, 'JetBrains Mono')", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
}
