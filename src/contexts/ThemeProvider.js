"use client";

import { createContext, useState } from "react";

// create the theme context with default selected theme
export const ThemeContext = createContext({});

// it provides the theme context to app
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(
        typeof localStorage !== "undefined"
            ? localStorage.getItem("labeeb-theme")
            : "light",
    );

    if (typeof document === "undefined") {
        return <>{children}</>;
    } else {
        document.body.classList.add(theme);

        const provider = {
            theme,
            changeTheme: (newTheme) => {
                setTheme(newTheme);
                localStorage.setItem("labeeb-theme", newTheme);
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
