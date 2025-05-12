"use client";

import { createContext, useEffect, useState } from "react";

// create the theme context with default selected theme
export const ThemeContext = createContext({});

// it provides the theme context to app
export function ThemeProvider({ children, savedTheme = "light" }) {
    const [theme, setTheme] = useState(savedTheme);

    useEffect(() => {
        // Set the data-color-mode attribute
        document.documentElement.setAttribute("data-color-mode", theme);

        // Handle body classes
        if (theme === "dark") {
            document.body.classList.add("dark");
        } else {
            document.body.classList.remove("dark");
        }
    }, [theme]);

    if (typeof document === "undefined") {
        return <>{children}</>;
    }

    const provider = {
        theme,
        changeTheme: (newTheme) => {
            setTheme(newTheme);
            document.cookie = `theme=${newTheme}; path=/`;
        },
    };

    return (
        <ThemeContext.Provider value={provider}>
            {children}
        </ThemeContext.Provider>
    );
}
