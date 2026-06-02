/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#0a0a0a",
        "app-elevated": "#121212",
        panel: "#1a1a1a",
        "panel-muted": "#141414",
        "panel-strong": "#202020",
        divider: "#2a2a2a",
        ink: "#f8fafc",
        "ink-soft": "#dbe4f0",
        "ink-muted": "#94a3b8",
        accent: "rgb(var(--theme-primary-rgb) / <alpha-value>)",
        "accent-secondary": "rgb(var(--theme-secondary-rgb) / <alpha-value>)",
        "accent-soft": "rgb(var(--theme-glow-rgb) / <alpha-value>)",
        "accent-hover": "rgb(var(--theme-primary-hover-rgb) / <alpha-value>)",
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#fb7185",
      },
      borderRadius: {
        card: "1.5rem",
        shell: "2rem",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(0, 0, 0, 0.55)",
        hero: "0 28px 120px rgba(0, 0, 0, 0.7)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
