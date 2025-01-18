import React, {
    createContext,
    useContext,
    useState,
    useRef,
    useEffect,
} from "react";
import { toast } from "react-toastify";
import { useSubscription } from "@apollo/client";
import { SUBSCRIPTIONS } from "../graphql";
import { useTranslation } from "react-i18next";

const TIMEOUT_DURATION = 5 * 60 * 1000; // time out if no progress update received for 5 minutes

const ProgressContext = createContext(undefined);

function ProgressToast({
    requestId,
    initialText,
    onComplete,
    onError,
    timeout = TIMEOUT_DURATION,
    activeToasts,
}) {
    const [progress, setProgress] = useState(10);
    const [errorMessage, setErrorMessage] = useState(null);
    const timeoutRef = useRef();
    const subscriptionRef = useRef();
    const [isCancelled, setIsCancelled] = useState(false);
    const onCompleteCalledRef = useRef(false);
    const { t } = useTranslation();

    const ERROR_MESSAGES = {
        timeout: t("The operation timed out. Please try again."),
        generic: t("An error occurred. Please try again."),
    };

    const resetTimeout = React.useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            if (onCompleteCalledRef.current) {
                // if we're here, it means that the timeout
                // has elapsed since we received the last message.
                // if onComplete has been called, there's nothing
                // else to do, so we can just close the toast.
                toast.dismiss(requestId);
                return;
            }

            const timeoutError = new Error(ERROR_MESSAGES.timeout);
            onError?.(timeoutError);
            setErrorMessage(ERROR_MESSAGES.timeout);
            toast.update(requestId, { closeButton: true });
            if (subscriptionRef.current) {
                subscriptionRef.current();
            }
        }, timeout);
    }, [timeout, onError, requestId]);

    // Initial timeout setup
    useEffect(() => {
        resetTimeout();
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (subscriptionRef.current) {
                subscriptionRef.current();
            }
        };
    }, [resetTimeout]);

    const { data, error } = useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [requestId] },
        onSubscriptionComplete: () => {
            subscriptionRef.current = null;
        },
    });

    useEffect(() => {
        return () => {
            if (subscriptionRef.current) {
                subscriptionRef.current();
            }
        };
    }, []);

    React.useEffect(() => {
        if (error) {
            onError?.(error);
            setErrorMessage(ERROR_MESSAGES.generic);
            toast.update(requestId, { closeButton: true });
            return;
        }

        // Reset timeout when new progress data is received
        if (data?.requestProgress) {
            resetTimeout();
        }

        const result = data?.requestProgress?.data;
        const newProgress = Math.max(
            (data?.requestProgress?.progress || 0) * 100,
            progress,
        );

        if (newProgress > progress) {
            setProgress(newProgress);
        }

        if (
            result &&
            data.requestProgress.progress === 1 &&
            !onCompleteCalledRef.current
        ) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            let finalData = result;
            try {
                finalData = JSON.parse(result);
            } catch (e) {
                // ignore json parse error
            }

            onCompleteCalledRef.current = true;

            onComplete?.(finalData)
                .then(() => {
                    activeToasts?.delete(requestId);
                    toast.update(requestId, { closeButton: true });
                })
                .catch((e) => {
                    setErrorMessage(e.message);
                    toast.update(requestId, { closeButton: true });
                });
        }
    }, [
        data,
        error,
        requestId,
        onComplete,
        progress,
        onError,
        activeToasts,
        resetTimeout,
    ]);

    const handleCancel = () => {
        if (
            window.confirm(t("Are you sure you want to cancel this operation?"))
        ) {
            setIsCancelled(true);
            if (subscriptionRef.current) {
                subscriptionRef.current();
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            onError?.(new Error(t("Operation cancelled")));
            setErrorMessage(t("Operation cancelled"));
            activeToasts?.delete(requestId);
            toast.update(requestId, { closeButton: true });
        }
    };

    return (
        <div className="min-w-[250px]">
            {!errorMessage ? (
                <>
                    <div className="mb-2">
                        <div className="h-2 w-full bg-gray-200 rounded-full">
                            <div
                                className="h-full bg-sky-600 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="text-sm">{initialText}</div>
                    </div>
                    {progress === 100 && (
                        <div className="flex justify-end">
                            <div className="text-sm text-green-700">
                                {t("Complete")}
                            </div>
                        </div>
                    )}
                    {data?.requestProgress?.info && (
                        <div className="text-xs bg-gray-50 p-2 rounded-md text-gray-500 mt-1">
                            {data.requestProgress.info}
                        </div>
                    )}
                    {!isCancelled && progress < 100 && (
                        <div className="flex justify-end">
                            <button
                                onClick={handleCancel}
                                className="text-sm text-red-600 hover:text-red-800"
                            >
                                {t("Cancel")}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="text-sm">{initialText}</div>
                    <div className="text-sm text-red-600">{errorMessage}</div>
                </>
            )}
        </div>
    );
}

export function ProgressProvider({ children }) {
    const [activeToasts] = useState(new Set());

    const addProgressToast = (
        requestId,
        initialText = "Processing...",
        onComplete,
        onError,
        timeout,
    ) => {
        if (activeToasts.has(requestId)) return;

        activeToasts.add(requestId);

        toast(
            <ProgressToast
                requestId={requestId}
                initialText={initialText}
                onComplete={onComplete}
                onError={onError}
                timeout={timeout}
                activeToasts={activeToasts}
            />,
            {
                toastId: requestId,
                autoClose: false,
                closeOnClick: false,
                draggable: false,
                closeButton: false,
                position: "bottom-right",
            },
        );
    };

    const removeProgressToast = (requestId) => {
        toast.dismiss(requestId);
        activeToasts.delete(requestId);
    };

    return (
        <ProgressContext.Provider
            value={{
                addProgressToast,
                removeProgressToast,
                activeToasts,
            }}
        >
            {children}
        </ProgressContext.Provider>
    );
}

export function useProgress() {
    const context = useContext(ProgressContext);
    if (!context) {
        throw new Error("useProgress must be used within a ProgressProvider");
    }
    return context;
}
