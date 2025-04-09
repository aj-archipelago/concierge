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
import { AutoTranscribeProvider } from "./contexts/AutoTranscribeContext";
import Layout from "./layout/Layout";
import "./tailwind.css";

const { NEXT_PUBLIC_AMPLITUDE_API_KEY } = process.env;

if (typeof document !== "undefined") {
    try {
        amplitude.init(NEXT_PUBLIC_AMPLITUDE_API_KEY, {
            defaultTracking: true,
        });
        console.log("Amplitude initialized successfully");
    } catch (error) {
        console.error("Failed to initialize Amplitude:", error);
    }
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
    const { data: serverUserState, refetch: refetchServerUserState } =
        useUserState();
    const updateUserState = useUpdateUserState();
    const [userState, setUserState] = useState(null);
    const debouncedUserState = useDebounce(userState, STATE_DEBOUNCE_TIME);
    const [refetchCalled, setRefetchCalled] = useState(false);

    const refetchUserState = () => {
        setRefetchCalled(true);
        refetchServerUserState();
    };

    useEffect(() => {
        // set user state from server if it exists, but only if there's no client
        // state yet
        if (
            (!userState || refetchCalled) &&
            JSON.stringify(serverUserState) !== JSON.stringify(userState)
        ) {
            setUserState(serverUserState);
            setRefetchCalled(false);
        }
    }, [userState, serverUserState, refetchCalled]);

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
                            <AutoTranscribeProvider>
                                <React.StrictMode>
                                    <AuthContext.Provider
                                        value={{
                                            user: currentUser,
                                            userState,
                                            refetchUserState,
                                            debouncedUpdateUserState,
                                        }}
                                    >
                                        <Layout>
                                            <Body>{children}</Body>
                                        </Layout>
                                    </AuthContext.Provider>
                                </React.StrictMode>
                            </AutoTranscribeProvider>
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
