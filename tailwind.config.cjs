/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "rgb(var(--app-rgb) / <alpha-value>)",
        "app-elevated": "rgb(var(--app-elevated-rgb) / <alpha-value>)",
        panel: "rgb(var(--panel-rgb) / <alpha-value>)",
        "panel-muted": "rgb(var(--panel-muted-rgb) / <alpha-value>)",
        "panel-strong": "rgb(var(--panel-strong-rgb) / <alpha-value>)",
        divider: "rgb(var(--divider-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft-rgb) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-foreground": "rgb(var(--accent-foreground-rgb) / <alpha-value>)",
        "accent-secondary": "rgb(var(--accent-secondary-rgb) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft-rgb) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover-rgb) / <alpha-value>)",
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
