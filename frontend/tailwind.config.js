/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#15181E", soft: "#3A404B", mute: "#6A7280" },
        canvas: "#F3F4F6",
        line: "#E2E5EA",
        brand: { 50: "#E8F5F2", 100: "#C8E7E0", 500: "#14917B", 600: "#0B7A68", 700: "#096354" },
        pop: { DEFAULT: "#E0245E", 50: "#FDECF2" },
      },
    },
  },
  plugins: [],
};
