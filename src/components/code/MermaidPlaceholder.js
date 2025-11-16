import React, { useRef, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";

// Global registry to track animation start time for each spinner key
// This ensures continuity even when React remounts the component
const spinnerStartTimes = new Map();

const MermaidPlaceholder = React.memo(({ spinnerKey }) => {
    const { t } = useTranslation();
    const spinnerRef = useRef(null);

    useLayoutEffect(() => {
        if (!spinnerRef.current || !spinnerKey) return;
        
        const spinner = spinnerRef.current;
        const now = performance.now();
        
        // Get or create the start time for this spinner key
        if (!spinnerStartTimes.has(spinnerKey)) {
            // First time we see this spinner - record the start time
            spinnerStartTimes.set(spinnerKey, now);
        }
        
        const startTime = spinnerStartTimes.get(spinnerKey);
        const animationDuration = 1000; // 1s for spin animation
        
        // Calculate how much time has elapsed since the spinner started
        const elapsed = (now - startTime) % animationDuration;
        
        // Use negative animation-delay to start the animation at the correct point
        // This makes it appear to continue seamlessly from where it left off
        const delay = -elapsed;
        spinner.style.animationDelay = `${delay}ms`;
        
        // Clean up old entries (older than 10 seconds) to prevent memory leaks
        // But only clean up entries that aren't the current one
        const cleanupThreshold = 10000;
        for (const [key, time] of spinnerStartTimes.entries()) {
            if (key !== spinnerKey && (now - time) > cleanupThreshold) {
                spinnerStartTimes.delete(key);
            }
        }
    }); // Run on every render to resync animation when component remounts

    return (
        <div className="mermaid-placeholder my-3 px-2 sm:px-3 py-2 rounded-md border border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/30 flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <div className="w-4 h-4 text-sky-500 dark:text-sky-400">
                <div
                    ref={spinnerRef}
                    className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-sky-500 dark:border-t-sky-400 rounded-full animate-spin"
                />
            </div>
            <span className="font-medium">{t("Loading chart...")}</span>
        </div>
    );
});

MermaidPlaceholder.displayName = "MermaidPlaceholder";

export default MermaidPlaceholder;
