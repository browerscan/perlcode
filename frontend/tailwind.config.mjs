/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        // Perl camel color palette
        perl: {
          50: "#fef7e7",
          100: "#fdecc3",
          200: "#fbdb8a",
          300: "#f8c446",
          400: "#f5ab1a",
          500: "#e68a0b",
          600: "#c96607",
          700: "#a1460a",
          800: "#843810",
          900: "#6f3011",
          950: "#401705",
        },
        // Dark theme
        dark: {
          50: "#f7f7f8",
          100: "#ececf1",
          200: "#d9d9e3",
          300: "#c5c5d2",
          400: "#acacbe",
          500: "#8e8ea0",
          600: "#565869",
          700: "#40414f",
          800: "#343541",
          900: "#202123",
          950: "#0d0d0f",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            code: {
              backgroundColor: theme("colors.gray.100"),
              borderRadius: theme("borderRadius.md"),
              padding: "0.125rem 0.25rem",
              fontWeight: "400",
            },
            "code::before": {
              content: '""',
            },
            "code::after": {
              content: '""',
            },
            pre: {
              backgroundColor: theme("colors.dark.900"),
              color: theme("colors.gray.100"),
            },
          },
        },
        invert: {
          css: {
            code: {
              backgroundColor: theme("colors.dark.700"),
            },
          },
        },
      }),
    },
  },
  plugins: [require("@tailwindcss/typography")],
  darkMode: "class",
};
