"use client";
import { ApolloProvider } from "@apollo/client";
import React, {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
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
import { AuthProvider } from "./components/AuthProvider";
import { AuthErrorDialog } from "./components/AuthErrorDialog";
import { AuthLoadingOverlay } from "./components/AuthLoadingOverlay";

const NEXT_PUBLIC_AMPLITUDE_API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

// Skip Amplitude initialization in test environment
if (typeof document !== "undefined" && process.env.NODE_ENV !== "test") {
    try {
        console.log(
            "Initializing Amplitude with API key:",
            NEXT_PUBLIC_AMPLITUDE_API_KEY ? "present" : "missing",
        );
        amplitude.init(NEXT_PUBLIC_AMPLITUDE_API_KEY, {
            defaultTracking: true,
            logLevel: amplitude.Types.LogLevel.Warn,
        });
        console.log("Amplitude initialized successfully");

        // Test event to verify tracking
        amplitude.track("Test Event", { timestamp: new Date().toISOString() });
        console.log("Test event sent successfully");
    } catch (error) {
        console.error("Failed to initialize Amplitude:", error);
    }
}

export const AuthContext = React.createContext({});
export const CurrentUserContext = React.createContext(null);

const STATE_DEBOUNCE_TIME = 1000;

const serializeUserState = (state) =>
    state === undefined ? undefined : JSON.stringify(state);

const normalizeServerUserState = (state) => (state == null ? {} : state);

function mergeUserStateUpdate(previousState, value) {
    if (typeof value === "function") {
        return {
            ...previousState,
            ...value(previousState),
        };
    }

    return {
        ...previousState,
        ...value,
    };
}

function getUserStateSignature(value) {
    return JSON.stringify(value);
}

const App = ({
    children,
    language,
    theme,
    serverUrl,
    graphQLPublicEndpoint,
    neuralspaceEnabled,
    xaiTranscribeEnabled,
    xaiTranscribeDefaultEnabled,
    maiTranscribeEnabled,
    transcribeDefaultModelOption,
    transcribeAlternateModelOption,
    useBlueGraphQL,
    initialActiveChats,
}) => {
    const { data: currentUser } = useCurrentUser();
    const { data: serverUserState, refetch: refetchServerUserState } =
        useUserState();
    const updateUserState = useUpdateUserState();

    const [userState, setUserState] = useState(null);
    const debouncedUserState = useDebounce(userState, STATE_DEBOUNCE_TIME);
    const userStateRef = useRef(null);
    const skippedDebouncedUserStateRef = useRef(null);
    const refetchCalledRef = useRef(false);
    const lastPersistedUserStateRef = useRef(null);

    const refetchUserState = useCallback(() => {
        refetchCalledRef.current = true;
        refetchServerUserState();
    }, [refetchServerUserState]);

    useEffect(() => {
        const normalizedServerUserState =
            serverUserState === undefined
                ? undefined
                : normalizeServerUserState(serverUserState);
        const serializedServerUserState = serializeUserState(
            normalizedServerUserState,
        );
        const serializedUserState = serializeUserState(userState);

        if (serverUserState !== undefined) {
            lastPersistedUserStateRef.current = serializedServerUserState;
        }

        // set user state from server if it exists, but only if there's no client
        // state yet
        if (
            (!userState || refetchCalledRef.current) &&
            serverUserState !== undefined &&
            serializedServerUserState !== serializedUserState
        ) {
            userStateRef.current = normalizedServerUserState;
            setUserState(normalizedServerUserState);
        }

        if (serverUserState !== undefined && refetchCalledRef.current) {
            refetchCalledRef.current = false;
        }
    }, [userState, serverUserState]);

    useEffect(() => {
        if (i18next.language !== language) {
            i18next.changeLanguage(language);
        }
        dayjs.locale(language);
    }, [language]);

    useEffect(() => {
        if (debouncedUserState == null) return;

        const debouncedUserStateSignature =
            getUserStateSignature(debouncedUserState);
        if (
            skippedDebouncedUserStateRef.current === debouncedUserStateSignature
        ) {
            skippedDebouncedUserStateRef.current = null;
            return;
        }

        if (debouncedUserStateSignature === lastPersistedUserStateRef.current) {
            return;
        }

        lastPersistedUserStateRef.current = debouncedUserStateSignature;
        updateUserState.mutate(debouncedUserState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedUserState]);

    const debouncedUpdateUserState = useCallback((value) => {
        setUserState((prev) => {
            const nextState = mergeUserStateUpdate(prev, value);
            userStateRef.current = nextState;
            return nextState;
        });
    }, []);

    const updateUserStateNow = useCallback(
        async (value) => {
            const nextState = mergeUserStateUpdate(userStateRef.current, value);
            userStateRef.current = nextState;
            skippedDebouncedUserStateRef.current =
                getUserStateSignature(nextState);
            setUserState(nextState);
            try {
                await updateUserState.mutateAsync(nextState);
                lastPersistedUserStateRef.current =
                    getUserStateSignature(nextState);
                return nextState;
            } catch (error) {
                if (
                    skippedDebouncedUserStateRef.current ===
                    getUserStateSignature(nextState)
                ) {
                    skippedDebouncedUserStateRef.current = null;
                }
                throw error;
            }
        },
        [updateUserState],
    );

    useEffect(() => {
        userStateRef.current = userState;
    }, [userState]);

    const authContextValue = useMemo(
        () => ({
            user: currentUser,
            userState,
            refetchUserState,
            debouncedUpdateUserState,
            updateUserStateNow,
        }),
        [
            currentUser,
            userState,
            refetchUserState,
            debouncedUpdateUserState,
            updateUserStateNow,
        ],
    );

    const serverContextValue = useMemo(
        () => ({
            graphQLPublicEndpoint,
            serverUrl,
            neuralspaceEnabled,
            xaiTranscribeEnabled,
            xaiTranscribeDefaultEnabled,
            maiTranscribeEnabled,
            transcribeDefaultModelOption,
            transcribeAlternateModelOption,
        }),
        [
            graphQLPublicEndpoint,
            serverUrl,
            neuralspaceEnabled,
            xaiTranscribeEnabled,
            xaiTranscribeDefaultEnabled,
            maiTranscribeEnabled,
            transcribeDefaultModelOption,
            transcribeAlternateModelOption,
        ],
    );

    const currentUserId =
        currentUser?.userId || currentUser?._id || currentUser?.id;
    const userScopedApolloKey = currentUserId || Boolean(currentUser);
    const apolloClient = useMemo(() => {
        if (!userScopedApolloKey) return null;
        return getClient(serverUrl, useBlueGraphQL);
    }, [serverUrl, useBlueGraphQL, userScopedApolloKey]);

    if (!currentUser || !apolloClient) {
        return null;
    }

    return (
        <ApolloProvider client={apolloClient}>
            <ServerContext.Provider value={serverContextValue}>
                <StoreProvider>
                    <AutoTranscribeProvider>
                        <AuthProvider>
                            <React.StrictMode>
                                <CurrentUserContext.Provider
                                    value={currentUser}
                                >
                                    <AuthContext.Provider
                                        value={authContextValue}
                                    >
                                        <ThemeProvider savedTheme={theme}>
                                            <LanguageProvider
                                                savedLanguage={language}
                                            >
                                                <Layout
                                                    initialActiveChats={
                                                        initialActiveChats
                                                    }
                                                >
                                                    <Body>{children}</Body>
                                                </Layout>
                                                <AuthErrorDialog />
                                                <AuthLoadingOverlay />
                                            </LanguageProvider>
                                        </ThemeProvider>
                                    </AuthContext.Provider>
                                </CurrentUserContext.Provider>
                            </React.StrictMode>
                        </AuthProvider>
                    </AutoTranscribeProvider>
                </StoreProvider>
            </ServerContext.Provider>
        </ApolloProvider>
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
