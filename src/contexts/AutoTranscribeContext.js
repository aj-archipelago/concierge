"use client";

import { createContext, useContext, useState } from "react";

const AutoTranscribeContext = createContext({
    attemptedAutoTranscribe: {},
    isAutoTranscribing: false,
    markAttempted: () => {},
    setIsAutoTranscribing: () => {},
});

export function AutoTranscribeProvider({ children }) {
    const [attemptedAutoTranscribe, setAttemptedAutoTranscribe] = useState({});
    const [isAutoTranscribing, setIsAutoTranscribing] = useState(false);

    const markAttempted = (videoUrl) => {
        setAttemptedAutoTranscribe((prev) => ({
            ...prev,
            [videoUrl]: true,
        }));
    };

    return (
        <AutoTranscribeContext.Provider
            value={{
                attemptedAutoTranscribe,
                isAutoTranscribing,
                markAttempted,
                setIsAutoTranscribing,
            }}
        >
            {children}
        </AutoTranscribeContext.Provider>
    );
}

export function useAutoTranscribe() {
    return useContext(AutoTranscribeContext);
}
