"use client";

import i18next from "i18next";
import { useEffect } from "react";
import { createContext, useState } from "react";

// create the language context with default selected language
export const LanguageContext = createContext({});

// it provides the language context to app
export function LanguageProvider({ savedLanguage, children }) {
    const [language, setLanguage] = useState(savedLanguage);
    const [direction, setDirection] = useState("ltr");

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
                document.documentElement.lang = "ar";
            } else {
                document.documentElement.dir = "ltr";
                document.documentElement.lang = "en";
            }

            i18next.changeLanguage(newLanguage);
        },
        direction,
    };

    return (
        <LanguageContext.Provider value={provider}>
            {children}
        </LanguageContext.Provider>
    );
}
