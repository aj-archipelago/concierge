"use client";

import { createContext, useContext, useState } from "react";

const AutoTranscribeContext = createContext({
    attemptedAutoTranscribe: {},
    isAutoTranscribing: false,
    markAttempted: () => {},
    setIsAutoTranscribing: () => {},
});

export function AutoTranscribeProvider({ children }) {
    const [attemptedAutoTranscribe, setAttemptedAutoTranscribe] =
        useState(false);
    const [isAutoTranscribing, setIsAutoTranscribing] = useState(false);

    const markAttempted = (value) => {
        setAttemptedAutoTranscribe(value);
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
