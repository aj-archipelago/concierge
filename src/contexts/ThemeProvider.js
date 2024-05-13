"use client";

import { createContext, useEffect, useState } from "react";

// create the theme context with default selected theme
export const ThemeContext = createContext({});

// it provides the theme context to app
export function ThemeProvider({ children, savedTheme = "light" }) {
    const [theme, setTheme] = useState(savedTheme);

    useEffect(() => {
        document.documentElement.setAttribute("data-color-mode", theme);
    }, [theme]);

    if (typeof document === "undefined") {
        return <>{children}</>;
    } else {
        document.body.classList.add(theme);

        const provider = {
            theme,
            changeTheme: (newTheme) => {
                setTheme(newTheme);
                document.cookie = `theme=${newTheme}; path=/`;
                document.body.classList.remove(theme);
                document.body.classList.add(newTheme);
                document.documentElement.setAttribute(
                    "data-color-mode",
                    newTheme,
                );
            },
        };

        return (
            <ThemeContext.Provider value={provider}>
                {children}
            </ThemeContext.Provider>
        );
    }
}
