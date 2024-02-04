import i18next from "i18next";
import { useEffect } from "react";
import { createContext, useState } from "react";
import { LanguageProvider } from "./LanguageProvider";
import { cookies } from "next/headers";

// create the language context with default selected language
export const LanguageContext = createContext({});

// it provides the language context to app
export async function LanguageProviderServer({ children }) {
    const savedLanguage = cookies.get("concierge-lang") || "en";

    console.log("savedLanguage", savedLanguage);

    return (
        <LanguageProvider savedLanguage={savedLanguage}>
            {children}
        </LanguageProvider>
    );
}
