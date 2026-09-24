"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from "react";

/**
 * Lightweight, self-rolled product-tour engine.
 *
 * The provider is intentionally generic: callers compute the step list for a
 * given screen (so tours can adapt to on-screen state) and hand it to
 * `startTour`. The <TourOverlay /> renders whatever the current step points at.
 *
 * Completion is persisted two ways:
 *  - via `onCompleteTour(id)` so the host app can store it server-side
 *    (per-user, cross-device), and
 *  - in localStorage as an immediate guard so an auto-start can't re-fire
 *    before the server round-trip resolves.
 */

const COMPLETED_STORAGE_PREFIX = "concierge-tour-completed:";

function readCompletedFromStorage(id) {
    if (typeof window === "undefined" || !id) return false;
    try {
        return (
            window.localStorage.getItem(`${COMPLETED_STORAGE_PREFIX}${id}`) ===
            "true"
        );
    } catch {
        return false;
    }
}

function writeCompletedToStorage(id) {
    if (typeof window === "undefined" || !id) return;
    try {
        window.localStorage.setItem(`${COMPLETED_STORAGE_PREFIX}${id}`, "true");
    } catch {
        // Ignore storage failures; server persistence still applies.
    }
}

const noop = () => {};

export const TourContext = createContext({
    isActive: false,
    tourId: null,
    steps: [],
    index: 0,
    currentStep: null,
    startTour: noop,
    next: noop,
    back: noop,
    goTo: noop,
    endTour: noop,
    isTourCompleted: () => false,
});

export function TourProvider({ children, completed = {}, onCompleteTour }) {
    const [tour, setTour] = useState(null); // { id, steps } | null
    const [index, setIndex] = useState(0);

    // Mirror state in refs so the navigation callbacks read fresh values
    // without nesting setState updaters (which React StrictMode double-invokes,
    // causing double advances).
    const tourRef = useRef(null);
    const indexRef = useRef(0);

    const applyTour = useCallback((nextTour) => {
        tourRef.current = nextTour;
        setTour(nextTour);
    }, []);

    const applyIndex = useCallback((nextIndex) => {
        indexRef.current = nextIndex;
        setIndex(nextIndex);
    }, []);

    const isTourCompleted = useCallback(
        (id) => Boolean(completed?.[id]) || readCompletedFromStorage(id),
        [completed],
    );

    const complete = useCallback(
        (id) => {
            writeCompletedToStorage(id);
            onCompleteTour?.(id);
        },
        [onCompleteTour],
    );

    const startTour = useCallback(
        ({ id, steps } = {}) => {
            if (!id || !Array.isArray(steps) || steps.length === 0) return;
            applyTour({ id, steps });
            applyIndex(0);
        },
        [applyTour, applyIndex],
    );

    const endTour = useCallback(
        ({ completed: didComplete = false } = {}) => {
            const current = tourRef.current;
            if (current && didComplete) {
                complete(current.id);
            }
            applyTour(null);
            applyIndex(0);
        },
        [applyTour, applyIndex, complete],
    );

    const next = useCallback(() => {
        const current = tourRef.current;
        if (!current) return;
        const last = current.steps.length - 1;
        if (indexRef.current >= last) {
            complete(current.id);
            applyTour(null);
            applyIndex(0);
        } else {
            applyIndex(indexRef.current + 1);
        }
    }, [applyTour, applyIndex, complete]);

    const back = useCallback(() => {
        applyIndex(Math.max(0, indexRef.current - 1));
    }, [applyIndex]);

    const goTo = useCallback(
        (nextIndex) => {
            const current = tourRef.current;
            if (!current) return;
            applyIndex(
                Math.min(Math.max(0, nextIndex), current.steps.length - 1),
            );
        },
        [applyIndex],
    );

    const value = useMemo(() => {
        const steps = tour?.steps || [];
        return {
            isActive: Boolean(tour),
            tourId: tour?.id || null,
            steps,
            index,
            currentStep: steps[index] || null,
            startTour,
            next,
            back,
            goTo,
            endTour,
            isTourCompleted,
        };
    }, [tour, index, startTour, next, back, goTo, endTour, isTourCompleted]);

    return (
        <TourContext.Provider value={value}>{children}</TourContext.Provider>
    );
}

export function useTour() {
    return useContext(TourContext);
}
