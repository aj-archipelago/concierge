"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AuthContext } from "../App";

// create the theme context with default selected theme
export const ThemeContext = createContext({});

// it provides the theme context to app
export function ThemeProvider({ children, savedTheme = "light" }) {
    const authContext = useContext(AuthContext);
    const { userState, debouncedUpdateUserState } = authContext || {};
    const [theme, setTheme] = useState(savedTheme);
    const [hasMigrated, setHasMigrated] = useState(false);

    // Migrate existing cookie preferences to userState (run once)
    useEffect(() => {
        if (!hasMigrated && userState && debouncedUpdateUserState && !userState.preferences?.theme && savedTheme) {
            // Migrate cookie preference to userState
            debouncedUpdateUserState((prev) => ({
                ...prev,
                preferences: {
                    ...prev?.preferences,
                    theme: savedTheme,
                },
            }));
            setHasMigrated(true);
        }
    }, [userState, savedTheme, hasMigrated, debouncedUpdateUserState]);

    // Initialize theme from userState or fall back to savedTheme (from cookies)
    useEffect(() => {
        if (userState?.preferences?.theme) {
            setTheme(userState.preferences.theme);
        } else if (savedTheme) {
            setTheme(savedTheme);
        }
    }, [userState?.preferences?.theme, savedTheme]);

    useEffect(() => {
        // Set the data-color-mode attribute
        document.documentElement.setAttribute("data-color-mode", theme);

        // Handle body classes
        if (theme === "dark") {
            document.body.classList.add("dark");
        } else {
            document.body.classList.remove("dark");
        }

        // Set CSS custom property for applets to detect color scheme
        // This allows applets to use CSS like: @media (prefers-color-scheme: dark) { ... }
        // by checking the --prefers-color-scheme property
        document.documentElement.style.setProperty(
            "--prefers-color-scheme",
            theme === "dark" ? "dark" : "light",
        );
    }, [theme]);

    if (typeof document === "undefined") {
        return <>{children}</>;
    }

    const provider = {
        theme,
        changeTheme: (newTheme) => {
            setTheme(newTheme);
            
            // Update userState for persistence across re-auth
            if (debouncedUpdateUserState) {
                debouncedUpdateUserState((prev) => ({
                    ...prev,
                    preferences: {
                        ...prev?.preferences,
                        theme: newTheme,
                    },
                }));
            }
            
            // Keep cookie for backward compatibility and SSR
            document.cookie = `theme=${newTheme}; path=/`;
        },
    };

    return (
        <ThemeContext.Provider value={provider}>
            {children}
        </ThemeContext.Provider>
    );
}
