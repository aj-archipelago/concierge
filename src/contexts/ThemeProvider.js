"use client";

import { createContext, useState } from "react";

// create the theme context with default selected theme
export const ThemeContext = createContext({});

// it provides the theme context to app
export function ThemeProvider({ children, savedTheme = "light" }) {
    const [theme, setTheme] = useState(savedTheme);

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
            },
        };

        return (
            <ThemeContext.Provider value={provider}>
                {children}
            </ThemeContext.Provider>
        );
    }
}
