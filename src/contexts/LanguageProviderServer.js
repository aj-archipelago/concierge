import { cookies } from "next/headers";
import { createContext } from "react";
import { LanguageProvider } from "./LanguageProvider";

// create the language context with default selected language
export const LanguageContext = createContext({});

// it provides the language context to app
export async function LanguageProviderServer({ children }) {
    const savedLanguage = cookies.get("concierge-lang") || "en";

    return (
        <LanguageProvider savedLanguage={savedLanguage}>
            {children}
        </LanguageProvider>
    );
}
