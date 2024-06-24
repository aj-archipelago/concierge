"use client";
import { ApolloNextAppProvider } from "@apollo/experimental-nextjs-app-support";
import React, { useContext, useRef, useEffect } from "react";
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
import {
    useCurrentUser,
    useUpdateUserState,
    useUserState,
} from "../app/queries/users";

const { NEXT_PUBLIC_AMPLITUDE_API_KEY } = process.env;

if (typeof document !== "undefined") {
    amplitude.init(NEXT_PUBLIC_AMPLITUDE_API_KEY, {
        defaultTracking: true,
    });
}

export const AuthContext = React.createContext({});

const App = ({ children, language, theme, serverUrl, neuralspaceEnabled }) => {
    const { data: currentUser } = useCurrentUser();
    const { data: userState } = useUserState();
    const updateUserState = useUpdateUserState();
    const pendingUpdates = useRef([]);

    useEffect(() => {
        if (i18next.language !== language) {
            i18next.changeLanguage(language);
        }
    }, [language]);

    if (!currentUser) {
        return null;
    }

    const debouncedUpdateUserState = (debouncingKey, value) => {
        const pendingUpdate = pendingUpdates.current.find(
            (update) => update.debouncingKey === debouncingKey,
        );

        if (pendingUpdate) {
            clearTimeout(pendingUpdate.timeout);
            pendingUpdates.current = pendingUpdates.current.filter(
                (update) => update.debouncingKey !== debouncingKey,
            );
        }

        const timeout = setTimeout(() => {
            updateUserState.mutate(value);
        }, 500);

        pendingUpdates.current.push({
            debouncingKey,
            timeout,
        });
    };

    return (
        <ApolloNextAppProvider makeClient={() => getClient(serverUrl)}>
            <ServerContext.Provider value={{ serverUrl, neuralspaceEnabled }}>
                <StoreProvider>
                    <ThemeProvider savedTheme={theme}>
                        <LanguageProvider savedLanguage={language}>
                            <React.StrictMode>
                                <AuthContext.Provider
                                    value={{
                                        user: currentUser,
                                        userState,
                                        debouncedUpdateUserState,
                                    }}
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
