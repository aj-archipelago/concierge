import { useEffect } from "react";
import { useInView } from "react-intersection-observer";

/**
 * Custom hook for infinite scroll functionality
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.hasNextPage - Whether there are more pages to load
 * @param {boolean} options.isFetchingNextPage - Whether the next page is currently being fetched
 * @param {Function} options.fetchNextPage - Function to fetch the next page
 * @param {Array} options.additionalConditions - Additional conditions that must be met before loading next page
 * @returns {Object} - Returns { ref, inView, shouldShowLoading } where ref should be attached to the loading trigger element
 */
export function useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    additionalConditions = [],
} = {}) {
    // Set up intersection observer for detecting when the scroll trigger element is visible
    const { ref, inView } = useInView({
        threshold: 0,
    });

    // Trigger loading more when scrolled to the bottom
    useEffect(() => {
        // Check if all additional conditions are met (if any)
        const conditionsMet = additionalConditions.every((condition) =>
            typeof condition === "function" ? condition() : condition,
        );

        if (inView && hasNextPage && !isFetchingNextPage && conditionsMet) {
            fetchNextPage();
        }
        // We intentionally don't include additionalConditions in the deps array
        // because we want to evaluate them fresh on each render, not memoize them
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

    return {
        ref, // Attach this ref to your loading trigger element (usually at the bottom of the list)
        inView,
        shouldShowLoading: hasNextPage && isFetchingNextPage, // Convenience flag for loading UI
    };
}
