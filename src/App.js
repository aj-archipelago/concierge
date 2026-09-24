"use client";
import { CurrentEntityProvider } from "./contexts/CurrentEntityContext";

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
import { TourProvider } from "./contexts/TourContext";
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

function BootstrapScreen({ language, state, isRetrying, onRetry }) {
    const isError = state === "error";
    const t = (key) => i18next.t(key, { lng: language });

    return (
        <main
            dir={language === "ar" ? "rtl" : "ltr"}
            className="flex min-h-[100dvh] w-full items-center justify-center bg-gray-50 px-4 py-8 text-gray-900 dark:bg-gray-950 dark:text-gray-100"
        >
            <section
                className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-8"
                role={isError ? "alert" : "status"}
                aria-live={isError ? "assertive" : "polite"}
            >
                {!isError && (
                    <div
                        className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-sky-100 border-t-sky-600 dark:border-sky-950 dark:border-t-sky-400"
                        aria-hidden="true"
                    />
                )}
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {t(
                        isError
                            ? "bootstrap.errorTitle"
                            : "bootstrap.loadingTitle",
                    )}
                </h1>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                    {t(
                        isError
                            ? "bootstrap.errorMessage"
                            : "bootstrap.loadingMessage",
                    )}
                </p>
                {isError && (
                    <button
                        type="button"
                        className="mt-6 min-h-11 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400 dark:focus:ring-offset-gray-900"
                        disabled={isRetrying}
                        onClick={onRetry}
                    >
                        {t(
                            isRetrying
                                ? "bootstrap.retrying"
                                : "bootstrap.retry",
                        )}
                    </button>
                )}
            </section>
        </main>
    );
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
    gemini35TranscribeEnabled,
    scribeV2TranscribeEnabled,
    transcribeDefaultModelOption,
    transcribeAlternateModelOption,
    realtimeAudio,
    useBlueGraphQL,
    initialActiveChats,
}) => {
    const currentUserQuery = useCurrentUser();
    const {
        data: currentUser,
        isError: isCurrentUserError,
        isFetching: isCurrentUserFetching,
        refetch: refetchCurrentUser,
    } = currentUserQuery;
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

    // Stable so the TourProvider context value doesn't churn on every render
    // (which would re-render the whole app tree and can trigger effect loops).
    const handleCompleteTour = useCallback(
        (id) => {
            const prevCompleted = userStateRef.current?.toursCompleted || {};
            debouncedUpdateUserState({
                toursCompleted: { ...prevCompleted, [id]: true },
            });
        },
        [debouncedUpdateUserState],
    );

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
            gemini35TranscribeEnabled,
            scribeV2TranscribeEnabled,
            transcribeDefaultModelOption,
            transcribeAlternateModelOption,
            realtimeAudio,
        }),
        [
            graphQLPublicEndpoint,
            serverUrl,
            neuralspaceEnabled,
            xaiTranscribeEnabled,
            xaiTranscribeDefaultEnabled,
            maiTranscribeEnabled,
            gemini35TranscribeEnabled,
            scribeV2TranscribeEnabled,
            transcribeDefaultModelOption,
            transcribeAlternateModelOption,
            realtimeAudio,
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
        const bootstrapFailed =
            isCurrentUserError ||
            (!currentUserQuery.isLoading && !currentUser) ||
            (currentUser && !apolloClient);

        return (
            <BootstrapScreen
                language={language}
                state={bootstrapFailed ? "error" : "loading"}
                isRetrying={isCurrentUserFetching}
                onRetry={() => refetchCurrentUser?.()}
            />
        );
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
                                        <CurrentEntityProvider>
                                            <TourProvider
                                                completed={
                                                    userState?.toursCompleted
                                                }
                                                onCompleteTour={
                                                    handleCompleteTour
                                                }
                                            >
                                                <ThemeProvider
                                                    savedTheme={theme}
                                                >
                                                    <LanguageProvider
                                                        savedLanguage={language}
                                                    >
                                                        <Layout
                                                            initialActiveChats={
                                                                initialActiveChats
                                                            }
                                                        >
                                                            <Body>
                                                                {children}
                                                            </Body>
                                                        </Layout>
                                                        <AuthErrorDialog />
                                                        <AuthLoadingOverlay />
                                                    </LanguageProvider>
                                                </ThemeProvider>
                                            </TourProvider>
                                        </CurrentEntityProvider>
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
