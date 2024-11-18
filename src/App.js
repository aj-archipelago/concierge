"use client";
import { ApolloNextAppProvider } from "@apollo/experimental-nextjs-app-support";
import React, { useContext, useEffect, useState } from "react";
import { getClient } from "./graphql";
import "./i18n";

import * as amplitude from "@amplitude/analytics-browser";
import { useDebounce } from "@uidotdev/usehooks";
import dayjs from "dayjs";
import i18next from "i18next";
import {
    useCurrentUser,
    useUpdateUserState,
    useUserState,
} from "../app/queries/users";
import classNames from "../app/utils/class-names";
import "./App.scss";
import StoreProvider from "./StoreProvider";
import { LanguageContext, LanguageProvider } from "./contexts/LanguageProvider";
import { ThemeProvider } from "./contexts/ThemeProvider";
import Layout from "./layout/Layout";
import "./tailwind.css";

const { NEXT_PUBLIC_AMPLITUDE_API_KEY } = process.env;

if (typeof document !== "undefined") {
    amplitude.init(NEXT_PUBLIC_AMPLITUDE_API_KEY, {
        defaultTracking: true,
    });
}

export const AuthContext = React.createContext({});

const STATE_DEBOUNCE_TIME = 1000;

const App = ({
    children,
    language,
    theme,
    serverUrl,
    graphQLPublicEndpoint,
    neuralspaceEnabled,
}) => {
    const { data: currentUser } = useCurrentUser();
    const { data: serverUserState } = useUserState();
    const updateUserState = useUpdateUserState();
    const [userState, setUserState] = useState(serverUserState || {});
    const debouncedUserState = useDebounce(userState, STATE_DEBOUNCE_TIME);

    useEffect(() => {
        // set user state from server if it exists
        if (!userState && serverUserState) {
            setUserState(serverUserState);
        }
    }, [userState, serverUserState]);

    useEffect(() => {
        if (i18next.language !== language) {
            i18next.changeLanguage(language);
        }
        dayjs.locale(language);
    }, [language]);

    useEffect(() => {
        updateUserState.mutate(debouncedUserState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedUserState]);

    if (!currentUser) {
        return null;
    }

    const debouncedUpdateUserState = (value) => {
        if (typeof value === "function") {
            setUserState((prev) => {
                return {
                    ...prev,
                    ...value(prev),
                };
            });
        } else {
            setUserState({
                ...userState,
                ...value,
            });
        }
    };

    return (
        <ApolloNextAppProvider makeClient={() => getClient(serverUrl)}>
            <ServerContext.Provider
                value={{ graphQLPublicEndpoint, serverUrl, neuralspaceEnabled }}
            >
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
