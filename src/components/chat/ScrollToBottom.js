import React, { useEffect, useRef, useCallback } from "react";

const ScrollToBottom = ({ children, loadComplete, forceScroll }) => {
    const containerRef = useRef(null);
    const lastScrollTopRef = useRef(0);
    const lastScrollHeightRef = useRef(0);

    const shouldAutoScroll = useCallback(() => {
        if (!containerRef.current) return true;

        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        // Check if user was already at bottom before content changed
        const wasAtBottom =
            lastScrollTopRef.current + clientHeight >=
            lastScrollHeightRef.current - 10;

        // Update refs for next check
        lastScrollTopRef.current = scrollTop;
        lastScrollHeightRef.current = scrollHeight;

        return wasAtBottom || forceScroll;
    }, [forceScroll]);

    const scrollToBottom = useCallback(() => {
        if (!containerRef.current) return;

        const { scrollHeight, clientHeight } = containerRef.current;
        const maxScrollTop = scrollHeight - clientHeight;

        if (maxScrollTop > 0) {
            containerRef.current.scrollTo({
                top: maxScrollTop,
                behavior: "smooth",
            });
        }
    }, []);

    useEffect(() => {
        if (shouldAutoScroll()) {
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                scrollToBottom();
            });
        }
    }, [children, loadComplete, shouldAutoScroll, scrollToBottom, forceScroll]);

    return (
        <div
            ref={containerRef}
            className="overflow-y-auto h-full min-h-0 flex-1 scroll-smooth"
            onScroll={() => {
                if (containerRef.current) {
                    const { scrollTop, scrollHeight } = containerRef.current;
                    lastScrollTopRef.current = scrollTop;
                    lastScrollHeightRef.current = scrollHeight;
                }
            }}
        >
            {children}
        </div>
    );
};

export default ScrollToBottom;
