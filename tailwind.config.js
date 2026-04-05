import { fontFamily } from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "sheet-gray": "#d9d9dd"
      },
      fontFamily: {
        times: ['"Times New Roman"', ...fontFamily.serif]
      },
      boxShadow: {
        sheet: "0 0 12px rgba(0,0,0,0.25)"
      },
      spacing: {
        pageX: "2.5cm",
        pageY: "3cm"
      }
    }
  },
  plugins: []
};
