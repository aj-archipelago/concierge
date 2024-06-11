"use client";
import { ApolloNextAppProvider } from "@apollo/experimental-nextjs-app-support";
import React, { useContext } from "react";
import { getClient } from "./graphql";
import "./i18n";

import * as amplitude from "@amplitude/analytics-browser";
import i18next from "i18next";
import classNames from "../app/utils/class-names";
import StoreProvider from "./StoreProvider";
import { LanguageContext, LanguageProvider } from "./contexts/LanguageProvider";
import { ThemeProvider } from "./contexts/ThemeProvider";
import Layout from "./layout/Layout";
import "./App.scss";
import "./tailwind.css";
import { useCurrentUser } from "../app/queries/users";

const { NEXT_PUBLIC_AMPLITUDE_API_KEY } = process.env;

if (typeof document !== "undefined") {
    amplitude.init(NEXT_PUBLIC_AMPLITUDE_API_KEY, {
        defaultTracking: true,
    });
}

export const AuthContext = React.createContext({});

const App = ({ children, language, theme, serverUrl }) => {
    if (i18next.language !== language) {
        i18next.changeLanguage(language);
    }

    const { data: currentUser } = useCurrentUser();

    if (!currentUser) {
        return null;
    }

    return (
        <ApolloNextAppProvider makeClient={() => getClient(serverUrl)}>
            <ServerContext.Provider value={{ serverUrl }}>
                <StoreProvider>
                    <ThemeProvider savedTheme={theme}>
                        <LanguageProvider savedLanguage={language}>
                            <React.StrictMode>
                                <AuthContext.Provider
                                    value={{ user: currentUser }}
                                >
                                    <Layout>
                                        <Body>{children}</Body>
                                    </Layout>
                                </AuthContext.Provider>
                            </React.StrictMode>
                        </LanguageProvider>
                    </ThemeProvider>
                </StoreProvider>
            </ServerContext.Provider>
        </ApolloNextAppProvider>
    );
};

const Body = ({ children, tosTimestamp }) => {
    const containerStyles = {};
    const { language } = useContext(LanguageContext);

    return (
        <div
            dir={language === "ar" ? "rtl" : "ltr"}
            className={classNames("h-full")}
            style={containerStyles}
        >
            {children}
        </div>
    );
};

export const ServerContext = React.createContext({});

export default App;
