import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: [],
  theme: {
    extend: {
      tokens: {
        colors: {
          // クリーム色ベースのライトテーマ
          cream: {
            50: { value: "#FFFDF7" },
            100: { value: "#FFF9E6" },
            200: { value: "#FFF3CC" },
            300: { value: "#FFEDB3" },
            400: { value: "#FFE799" },
            500: { value: "#FFE180" },
            600: { value: "#E6C266" },
            700: { value: "#B8944D" },
            800: { value: "#8A6633" },
            900: { value: "#5C381A" },
          },
          // VRChatブルー系アクセント
          vrc: {
            primary: { value: "#1E88E5" },
            secondary: { value: "#64B5F6" },
            accent: { value: "#00BCD4" },
            success: { value: "#4CAF50" },
            warning: { value: "#FF9800" },
            error: { value: "#F44336" },
          },
          // ダークモード用
          dark: {
            bg: { value: "#1A1A2E" },
            card: { value: "#252540" },
            border: { value: "#3A3A5C" },
            text: { value: "#E8E8F0" },
            muted: { value: "#9090A8" },
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
          sm: { value: "0.25rem" },
          md: { value: "0.5rem" },
          lg: { value: "0.75rem" },
          xl: { value: "1rem" },
          full: { value: "9999px" },
        },
        shadows: {
          sm: { value: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" },
          md: { value: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" },
          lg: { value: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" },
        },
      },
      semanticTokens: {
        colors: {
          bg: {
            DEFAULT: {
              value: { base: "{colors.cream.50}", _dark: "{colors.dark.bg}" },
            },
            card: {
              value: { base: "{colors.cream.100}", _dark: "{colors.dark.card}" },
            },
            hover: {
              value: { base: "{colors.cream.200}", _dark: "{colors.dark.border}" },
            },
          },
          text: {
            DEFAULT: {
              value: { base: "{colors.cream.900}", _dark: "{colors.dark.text}" },
            },
            muted: {
              value: { base: "{colors.cream.700}", _dark: "{colors.dark.muted}" },
            },
          },
          border: {
            DEFAULT: {
              value: { base: "{colors.cream.300}", _dark: "{colors.dark.border}" },
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
  patterns: {
    extend: {
      card: {
        description: "カードコンテナパターン",
        defaultValues: {
          variant: "default",
        },
        properties: {
          variant: {
            type: "enum",
            value: ["default", "elevated", "outlined"],
          },
        },
        transform(props: any) {
          const { variant, ...rest } = props;
          const base = {
            bg: "bg.card",
            borderRadius: "lg",
            p: 4,
            transition: "all 0.2s",
          };

          const variants = {
            default: {
              border: "1px solid",
              borderColor: "border",
            },
            elevated: {
              boxShadow: "md",
              border: "1px solid",
              borderColor: "border",
              _hover: {
                boxShadow: "lg",
              },
            },
            outlined: {
              border: "2px solid",
              borderColor: "accent",
            },
          };

          return {
            ...base,
            ...variants[variant as keyof typeof variants],
            ...rest,
          };
        },
      },
    },
  },
  outdir: "styled-system",
  jsxFramework: "react",
});
