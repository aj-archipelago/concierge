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

const TIMEOUT_DURATION = 60 * 60 * 1000; // 60-minute timeout
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
    activeToasts,
}) {
    const [progress, setProgress] = useState(10);
    const [errorMessage, setErrorMessage] = useState(null);
    const timeoutRef = useRef();
    const subscriptionRef = useRef();
    const [isCancelled, setIsCancelled] = useState(false);

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
            toast.update(requestId, { closeButton: true });
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
    }, [data, error, requestId, onComplete, progress, onError, activeToasts]);

    const handleCancel = () => {
        if (window.confirm("Are you sure you want to cancel this operation?")) {
            setIsCancelled(true);
            if (subscriptionRef.current) {
                subscriptionRef.current();
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            onError?.(new Error("Operation cancelled"));
            setErrorMessage("Operation cancelled");
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
                                Complete
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
                                Cancel
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
