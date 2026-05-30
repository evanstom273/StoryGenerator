/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#090d16",
        "app-elevated": "#0e1320",
        panel: "#121a2b",
        "panel-muted": "#172033",
        "panel-strong": "#22304a",
        ink: "#f8fafc",
        "ink-soft": "#dbe4f0",
        "ink-muted": "#94a3b8",
        accent: "#8b5cf6",
        "accent-soft": "#c4b5fd",
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#fb7185",
      },
      borderRadius: {
        card: "1.5rem",
        shell: "2rem",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(2, 6, 23, 0.42)",
        hero: "0 28px 120px rgba(9, 13, 22, 0.65)",
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

