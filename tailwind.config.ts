import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 20px 80px -40px rgb(17 24 39 / 0.45)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-20%)" },
          "100%": { transform: "translateY(120%)" },
        },
        "draw-pop": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.96)" },
          "70%": { opacity: "1", transform: "translateY(0) scale(1.025)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "draw-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(13 148 136 / 0.28)" },
          "50%": { boxShadow: "0 0 0 18px rgb(13 148 136 / 0)" },
        },
        "draw-ticker": {
          "0%, 100%": { transform: "translateX(-8px)" },
          "50%": { transform: "translateX(8px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 700ms cubic-bezier(.22,1,.36,1) both",
        "scan-line": "scan-line 3.8s ease-in-out infinite",
        "draw-pop": "draw-pop 520ms cubic-bezier(.22,1,.36,1) both",
        "draw-glow": "draw-glow 1.5s ease-out infinite",
        "draw-ticker": "draw-ticker 520ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
