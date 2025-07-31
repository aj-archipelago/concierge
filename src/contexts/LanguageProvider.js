"use client";

import i18next from "i18next";
import { useContext, useEffect } from "react";
import { createContext, useState } from "react";
import dayjs from "dayjs";
import TimeAgo from "javascript-time-ago";
import ar from "javascript-time-ago/locale/ar.json";
import en from "javascript-time-ago/locale/en.json";
import { AuthContext } from "../App";

// create the language context with default selected language
export const LanguageContext = createContext({});

if (typeof document !== "undefined") {
    TimeAgo.addDefaultLocale(document.documentElement.lang === "ar" ? ar : en);
    TimeAgo.addLocale(ar);
    TimeAgo.addLocale(en);
}

// it provides the language context to app
export function LanguageProvider({ savedLanguage, children }) {
    const authContext = useContext(AuthContext);
    const { userState, debouncedUpdateUserState } = authContext || {};
    const [language, setLanguage] = useState(savedLanguage);
    const [direction, setDirection] = useState("ltr");
    const [hasMigrated, setHasMigrated] = useState(false);

    // Migrate existing cookie preferences to userState (run once)
    useEffect(() => {
        if (!hasMigrated && userState && debouncedUpdateUserState && !userState.preferences?.language && savedLanguage) {
            // Migrate cookie preference to userState
            debouncedUpdateUserState((prev) => ({
                ...prev,
                preferences: {
                    ...prev?.preferences,
                    language: savedLanguage,
                },
            }));
            setHasMigrated(true);
        }
    }, [userState, savedLanguage, hasMigrated, debouncedUpdateUserState]);

    // Initialize language from userState or fall back to savedLanguage (from cookies)
    useEffect(() => {
        if (userState?.preferences?.language) {
            setLanguage(userState.preferences.language);
        } else if (savedLanguage) {
            setLanguage(savedLanguage);
        }
    }, [userState?.preferences?.language, savedLanguage]);

    useEffect(() => {
        if ("ar" === language && direction) {
            setDirection("rtl");
        } else {
            setDirection("ltr");
        }
    }, [language, direction, setDirection]);

    const provider = {
        language,
        changeLanguage: (newLanguage) => {
            setLanguage(newLanguage);

            if ("ar" === newLanguage) {
                document.documentElement.dir = "rtl";
            } else {
                document.documentElement.dir = "ltr";
            }

            document.documentElement.lang = newLanguage;
            dayjs.locale(newLanguage);

            i18next.changeLanguage(newLanguage);

            // Update userState for persistence across re-auth
            if (debouncedUpdateUserState) {
                debouncedUpdateUserState((prev) => ({
                    ...prev,
                    preferences: {
                        ...prev?.preferences,
                        language: newLanguage,
                    },
                }));
            }

            // Keep cookie for backward compatibility and SSR
            document.cookie = `i18next=${newLanguage}; path=/`;
        },
        direction,
    };

    return (
        <LanguageContext.Provider value={provider}>
            {children}
        </LanguageContext.Provider>
    );
}
