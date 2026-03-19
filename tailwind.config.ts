// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    "animation-delay-100",
    "animation-delay-200",
    "animation-delay-300",
    "animation-delay-400",
    "animation-delay-500",
  ],
  theme: {
    extend: {
      keyframes: {
        heartbeat: {
          "0%, 100%": { transform: "scale(1)" },
          "30%":       { transform: "scale(1.18)" },
          "60%":       { transform: "scale(1.08)" },
        },
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%":   { transform: "scale(1)" },
          "40%":  { transform: "scale(1.22)" },
          "70%":  { transform: "scale(0.94)" },
          "100%": { transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-6px)" },
        },
        ripple: {
          "0%":   { transform: "scale(0)", opacity: "0.6" },
          "100%": { transform: "scale(4)", opacity: "0" },
        },
      },
      animation: {
        heartbeat: "heartbeat 1.4s ease-in-out infinite",
        fadeUp:    "fadeUp 0.5s ease-out forwards",
        pop:       "pop 0.35s ease-out forwards",
        float:     "float 3s ease-in-out infinite",
        ripple:    "ripple 0.6s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;