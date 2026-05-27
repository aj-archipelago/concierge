import { useEffect, useRef } from "react";

// Max consecutive auto-fetches before requiring user scroll.
// Fills the viewport on initial load without fetching the entire history.
const MAX_CONSECUTIVE_FETCHES = 3;

// Delay before re-checking sentinel visibility after a fetch completes.
// Lets the DOM settle so the new content is measured correctly.
const REOBSERVE_DELAY_MS = 100;

// Trigger fetches well before the sentinel is visible so data arrives
// before the user scrolls to it — the loading state is never seen.
const PREFETCH_ROOT_MARGIN = "400px";

/**
 * Walk up the DOM from `el` to find the nearest ancestor that is both
 * styled for overflow scrolling AND actually has overflowing content
 * (constrained height). Returns null when no scrollable ancestor is
 * found, which tells IntersectionObserver to use the viewport.
 */
function getScrollParent(el) {
    let node = el?.parentElement;
    while (node && node !== document.documentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflow + style.overflowY)) {
            if (node.scrollHeight > node.clientHeight + 1) {
                return node;
            }
        }
        node = node.parentElement;
    }
    return null;
}

export function useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    additionalConditions = [],
    rootRef = null,
} = {}) {
    const sentinelRef = useRef(null);
    const fetchingRef = useRef(false);
    const observerRef = useRef(null);
    const consecutiveFetchRef = useRef(0);
    const depsRef = useRef({
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        additionalConditions,
    });

    depsRef.current = {
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        additionalConditions,
    };

    // Set up the IntersectionObserver on the real scroll ancestor
    // (auto-detected from the sentinel's position in the DOM, not
    // rootRef which may point to a non-scrolling wrapper) and attach
    // a scroll listener that resets the auto-fetch cap so prefetch
    // resumes as the user scrolls through the list.
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        const scrollParent = getScrollParent(sentinel);

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !fetchingRef.current) {
                    const {
                        hasNextPage,
                        isFetchingNextPage,
                        fetchNextPage,
                        additionalConditions,
                    } = depsRef.current;
                    const conditionsMet = additionalConditions.every(
                        (condition) =>
                            typeof condition === "function"
                                ? condition()
                                : condition,
                    );

                    if (hasNextPage && !isFetchingNextPage && conditionsMet) {
                        fetchingRef.current = true;
                        fetchNextPage();
                    }
                }
            },
            {
                root: scrollParent,
                threshold: 0.1,
                rootMargin: PREFETCH_ROOT_MARGIN,
            },
        );

        observer.observe(sentinel);
        observerRef.current = observer;

        // Listen on the real scroll target so user scrolling resets the
        // auto-fetch cap and allows further prefetching.
        const scrollTarget = scrollParent || window;
        const onScroll = () => {
            consecutiveFetchRef.current = 0;
        };
        scrollTarget.addEventListener("scroll", onScroll, { passive: true });

        return () => {
            observer.disconnect();
            observerRef.current = null;
            scrollTarget.removeEventListener("scroll", onScroll);
        };
    }, [rootRef]);

    useEffect(() => {
        if (!isFetchingNextPage) {
            fetchingRef.current = false;
            consecutiveFetchRef.current += 1;

            // Allow a few auto-fetches to fill the viewport, then stop and
            // let the user's scroll drive further loading. The counter is
            // reset by the scroll listener above.
            if (consecutiveFetchRef.current >= MAX_CONSECUTIVE_FETCHES) return;

            const timer = setTimeout(() => {
                const observer = observerRef.current;
                const sentinel = sentinelRef.current;
                if (observer && sentinel) {
                    observer.unobserve(sentinel);
                    observer.observe(sentinel);
                }
            }, REOBSERVE_DELAY_MS);

            return () => clearTimeout(timer);
        }
    }, [isFetchingNextPage]);

    return {
        ref: sentinelRef,
        shouldShowLoading: hasNextPage && isFetchingNextPage,
    };
}
