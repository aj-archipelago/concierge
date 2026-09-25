"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AuthContext } from "../App";
import {
    applyTheme,
    getInitialTheme,
    normalizeTheme,
    saveThemeCookie,
} from "../utils/themePreference";

// create the theme context with default selected theme
export const ThemeContext = createContext({});

// it provides the theme context to app
export function ThemeProvider({ children, savedTheme }) {
    const authContext = useContext(AuthContext);
    const { userState, debouncedUpdateUserState } = authContext || {};
    const accountTheme = normalizeTheme(userState?.preferences?.theme);
    const cookieTheme = normalizeTheme(savedTheme);
    const [theme, setTheme] = useState(
        () => accountTheme || getInitialTheme(cookieTheme),
    );
    const [hasMigrated, setHasMigrated] = useState(false);

    // Migrate existing cookie preferences to userState (run once)
    useEffect(() => {
        if (
            !hasMigrated &&
            userState &&
            debouncedUpdateUserState &&
            !userState.preferences?.theme &&
            cookieTheme
        ) {
            // Migrate cookie preference to userState
            debouncedUpdateUserState((prev) => ({
                ...prev,
                preferences: {
                    ...prev?.preferences,
                    theme: cookieTheme,
                },
            }));
            setHasMigrated(true);
        }
    }, [userState, cookieTheme, hasMigrated, debouncedUpdateUserState]);

    // Initialize theme from userState or fall back to savedTheme (from cookies)
    useEffect(() => {
        if (accountTheme) {
            setTheme(accountTheme);
        } else if (cookieTheme) {
            setTheme(cookieTheme);
        }
    }, [accountTheme, cookieTheme]);

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    // Account restoration must also repair missing or stale startup cookies.
    // Do not persist a system fallback as an explicit user preference.
    useEffect(() => {
        const preference = accountTheme || cookieTheme;
        if (preference) saveThemeCookie(preference);
    }, [accountTheme, cookieTheme]);

    if (typeof document === "undefined") {
        return <>{children}</>;
    }

    const provider = {
        theme,
        changeTheme: (newTheme) => {
            if (!normalizeTheme(newTheme)) return;
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

            saveThemeCookie(newTheme);
        },
    };

    return (
        <ThemeContext.Provider value={provider}>
            {children}
        </ThemeContext.Provider>
    );
}
