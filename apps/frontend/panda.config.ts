import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: [],
  theme: {
    extend: {
      tokens: {
        colors: {
          // 和紙・木目調の暖かいベース
          warm: {
            50: { value: "#FDFAF5" },
            100: { value: "#F7F0E3" },
            200: { value: "#EFE0C8" },
            300: { value: "#E5CEAC" },
            400: { value: "#DABD91" },
            500: { value: "#C9A870" },
            600: { value: "#A88550" },
            700: { value: "#7A5E35" },
            800: { value: "#4F3B1E" },
            900: { value: "#2B1E0A" },
          },
          // VRChat系アクセント（落ち着いたトーン）
          vrc: {
            primary: { value: "#3D7EC8" },
            secondary: { value: "#6BA3DE" },
            accent: { value: "#2E9B9B" },
            success: { value: "#4A9A5A" },
            warning: { value: "#D4841A" },
            error: { value: "#C44040" },
          },
          // ダークモード
          dark: {
            bg: { value: "#1C1814" },
            card: { value: "#2A2420" },
            border: { value: "#3E3630" },
            text: { value: "#EDE8DF" },
            muted: { value: "#9A9088" },
          },
        },
        fonts: {
          body: { value: "'Noto Sans JP', system-ui, sans-serif" },
          heading: { value: "'Noto Sans JP', system-ui, sans-serif" },
        },
        fontSizes: {
          xs: { value: "0.75rem" },
          sm: { value: "0.875rem" },
          md: { value: "1rem" },
          lg: { value: "1.125rem" },
          xl: { value: "1.25rem" },
          "2xl": { value: "1.5rem" },
          "3xl": { value: "1.875rem" },
        },
        spacing: {
          xs: { value: "0.25rem" },
          sm: { value: "0.5rem" },
          md: { value: "1rem" },
          lg: { value: "1.5rem" },
          xl: { value: "2rem" },
          "2xl": { value: "3rem" },
        },
        radii: {
          sm: { value: "0.375rem" },
          md: { value: "0.625rem" },
          lg: { value: "1rem" },
          xl: { value: "1.25rem" },
          full: { value: "9999px" },
        },
        shadows: {
          sm: { value: "0 1px 3px 0 rgba(80, 50, 20, 0.08)" },
          md: { value: "0 3px 8px -1px rgba(80, 50, 20, 0.12)" },
          lg: { value: "0 8px 20px -3px rgba(80, 50, 20, 0.15)" },
        },
      },
      semanticTokens: {
        colors: {
          bg: {
            DEFAULT: {
              value: { base: "{colors.warm.50}", _dark: "{colors.dark.bg}" },
            },
            card: {
              value: { base: "{colors.warm.100}", _dark: "{colors.dark.card}" },
            },
            hover: {
              value: { base: "{colors.warm.200}", _dark: "{colors.dark.border}" },
            },
          },
          text: {
            DEFAULT: {
              value: { base: "{colors.warm.900}", _dark: "{colors.dark.text}" },
            },
            muted: {
              value: { base: "{colors.warm.700}", _dark: "{colors.dark.muted}" },
            },
          },
          border: {
            DEFAULT: {
              value: { base: "{colors.warm.300}", _dark: "{colors.dark.border}" },
            },
          },
          accent: {
            DEFAULT: {
              value: { base: "{colors.vrc.primary}", _dark: "{colors.vrc.secondary}" },
            },
          },
        },
      },
    },
  },
  conditions: {
    dark: "[data-theme='dark'] &, .dark &",
  },
  outdir: "styled-system",
  jsxFramework: "react",
});
