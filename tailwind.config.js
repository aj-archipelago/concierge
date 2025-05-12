const plugin = require("tailwindcss/plugin");

/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}", // Note the addition of the `app` directory.
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./@/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app.config/**/*.{js,ts,jsx,tsx,mdx}",
        "./config/**/*.{js,ts,jsx,tsx,mdx}",

        // Or if using `src` directory:
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    prefix: "",
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
                "fade-in": {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                shimmer: {
                    "0%": {
                        backgroundPosition: "200% 0",
                    },
                    "100%": {
                        backgroundPosition: "0% 0",
                    },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                "fade-in": "fade-in 0.3s ease-in-out",
                shimmer: "shimmer 3s infinite linear",
            },
        },
    },
    plugins: [
        require("tailwindcss-animate"),
        require("@tailwindcss/forms"),
        require("nightwind"),
        plugin(function ({ addVariant, e }) {
            addVariant("rtl", ({ modifySelectors, separator }) => {
                modifySelectors(({ className }) => {
                    return `html[dir="ltr"] .${e(`rtl${separator}${className}`)}, div[dir="ltr"] .${e(`rtl${separator}${className}`)}`;
                });
            });
        }),
    ],
};
