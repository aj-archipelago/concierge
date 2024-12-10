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

const TIMEOUT_DURATION = 5 * 60 * 1000; // 5 minutes timeout
const ERROR_MESSAGES = {
    timeout: "The operation timed out. Please try again.",
    generic: "An error occurred. Please try again.",
};

const ProgressContext = createContext(undefined);

function ProgressToast({
    requestId,
    initialText,
    onComplete,
    onError,
    timeout = TIMEOUT_DURATION,
}) {
    const [progress, setProgress] = useState(10);
    const [errorMessage, setErrorMessage] = useState(null);
    const timeoutRef = useRef();
    const subscriptionRef = useRef();

    useEffect(() => {
        timeoutRef.current = setTimeout(() => {
            const timeoutError = new Error(ERROR_MESSAGES.timeout);
            onError?.(timeoutError);
            setErrorMessage(ERROR_MESSAGES.timeout);
            if (subscriptionRef.current) {
                subscriptionRef.current();
            }
        }, timeout);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (subscriptionRef.current) {
                subscriptionRef.current();
            }
        };
    }, [timeout, requestId, onError]);

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
            return;
        }

        const result = data?.requestProgress?.data;
        const newProgress = Math.max(
            (data?.requestProgress?.progress || 0) * 100,
            progress,
        );

        if (newProgress > progress) {
            setProgress(newProgress);
        }

        if (result && data.requestProgress.progress === 1) {
            console.log("progress complete finalData", data.requestProgress);

            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            } else {
                return;
            }

            let finalData = result;
            try {
                finalData = JSON.parse(result);
            } catch (e) {
                // ignore json parse error
            }

            onComplete?.(finalData);
            toast.dismiss(requestId);
        }
    }, [data, error, requestId, onComplete, progress, onError]);

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
                    <div className="text-sm">{initialText}</div>
                    {data?.requestProgress?.info && (
                        <div className="text-xs bg-gray-50 p-2 rounded-mdtext-gray-500 mt-1">
                            {data.requestProgress.info}
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
            />,
            {
                toastId: requestId,
                autoClose: false,
                closeOnClick: false,
                draggable: false,
                closeButton: true,
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
            value={{ addProgressToast, removeProgressToast }}
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
