"use client";

import i18next from "i18next";
import { useEffect } from "react";
import { createContext, useState } from "react";
import dayjs from "dayjs";
import TimeAgo from "javascript-time-ago";
import ar from "javascript-time-ago/locale/ar.json";
import en from "javascript-time-ago/locale/en.json";
// create the language context with default selected language
export const LanguageContext = createContext({});

if (typeof document !== "undefined") {
    TimeAgo.addDefaultLocale(document.documentElement.lang === "ar" ? ar : en);
    TimeAgo.addLocale(ar);
    TimeAgo.addLocale(en);
}

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
            } else {
                document.documentElement.dir = "ltr";
            }

            document.documentElement.lang = newLanguage;
            dayjs.locale(newLanguage);

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
