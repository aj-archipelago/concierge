import React, {
    useEffect,
    useRef,
    useCallback,
    useImperativeHandle,
    forwardRef,
} from "react";

const ScrollToBottom = forwardRef(({ children, loadComplete }, ref) => {
    const containerRef = useRef(null);
    const userHasScrolledUp = useRef(false);
    const lastScrollTop = useRef(0);

    const scrollToBottom = useCallback(() => {
        if (!containerRef.current) return;

        const { scrollHeight, clientHeight } = containerRef.current;
        containerRef.current.scrollTo({
            top: (scrollHeight - clientHeight),
            behavior: "smooth"
        });
    }, []);

    // Reset scroll state and scroll to bottom
    const resetScrollState = useCallback(() => {
        userHasScrolledUp.current = false;
        scrollToBottom();
    }, [scrollToBottom]);

    // Expose reset function to parent
    useImperativeHandle(
        ref,
        () => ({
            resetScrollState,
        }),
        [resetScrollState],
    );

    // Scroll to bottom on new messages if user hasn't scrolled up
    useEffect(() => {
        if (!userHasScrolledUp.current && loadComplete) {
            scrollToBottom();
        }
    }, [children, scrollToBottom, loadComplete]);

    // Additional effect to ensure we scroll after all content is loaded
    useEffect(() => {
        if (loadComplete && !userHasScrolledUp.current) {
            scrollToBottom();
        }
    }, [loadComplete, scrollToBottom]);

    return (
        <div
            ref={containerRef}
            className="overflow-y-auto h-full min-h-0 flex-1 scroll-smooth"
            onScroll={() => {
                if (!containerRef.current) return;

                const { scrollTop, scrollHeight, clientHeight } =
                    containerRef.current;
                const isScrollingUp = scrollTop < lastScrollTop.current;
                lastScrollTop.current = scrollTop;

                // If scrolling up and not already marked as scrolled up
                if (isScrollingUp && !userHasScrolledUp.current) {
                    userHasScrolledUp.current = true;
                }

                // If we reach bottom, re-enable auto-scroll
                const isAtBottom =
                    Math.abs(scrollTop + clientHeight - scrollHeight) < 10;
                if (isAtBottom) {
                    userHasScrolledUp.current = false;
                }
            }}
        >
            {children}
        </div>
    );
});

export default ScrollToBottom;
