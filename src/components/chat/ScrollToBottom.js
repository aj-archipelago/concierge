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
    const scrollAttempts = useRef(0);
    const maxScrollAttempts = 3; // Maximum number of scroll attempts

    const scrollToBottom = useCallback(() => {
        if (!containerRef.current) return;

        const { scrollHeight, clientHeight } = containerRef.current;
        containerRef.current.scrollTo({
            top: scrollHeight - clientHeight,
            behavior: "auto",
        });
    }, []);

    // Check if we're actually at the bottom and retry if not
    const verifyScrollPosition = useCallback(() => {
        if (!containerRef.current || userHasScrolledUp.current) return;

        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const isAtBottom =
            Math.abs(scrollTop + clientHeight - scrollHeight) < 10;

        if (!isAtBottom && scrollAttempts.current < maxScrollAttempts) {
            // If not at bottom, try scrolling again with a slight delay
            scrollAttempts.current += 1;
            setTimeout(() => {
                scrollToBottom();
                // Check again after scrolling
                setTimeout(verifyScrollPosition, 100);
            }, 50 * scrollAttempts.current); // Increasing delay with each attempt
        } else {
            // Reset attempts counter after we're done
            scrollAttempts.current = 0;
        }
    }, [scrollToBottom]);

    // Enhanced scroll to bottom that verifies position
    const enhancedScrollToBottom = useCallback(() => {
        scrollAttempts.current = 0; // Reset attempts counter
        scrollToBottom();
        // Verify scroll position after initial scroll
        setTimeout(verifyScrollPosition, 100);
    }, [scrollToBottom, verifyScrollPosition]);

    // Reset scroll state and scroll to bottom
    const resetScrollState = useCallback(() => {
        userHasScrolledUp.current = false;
        enhancedScrollToBottom();
    }, [enhancedScrollToBottom]);

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
        if (!userHasScrolledUp.current) {
            enhancedScrollToBottom();
        }
    }, [children, enhancedScrollToBottom]);

    // Additional effect to ensure we scroll after all content is loaded
    useEffect(() => {
        if (loadComplete && !userHasScrolledUp.current) {
            enhancedScrollToBottom();
        }
    }, [loadComplete, enhancedScrollToBottom]);

    // Final check after a delay to catch any late-rendering content
    useEffect(() => {
        if (loadComplete && !userHasScrolledUp.current) {
            const timeoutId = setTimeout(() => {
                verifyScrollPosition();
            }, 300); // Longer delay to catch late DOM updates

            return () => clearTimeout(timeoutId);
        }
    }, [loadComplete, verifyScrollPosition]);

    return (
        <div
            ref={containerRef}
            className="overflow-y-auto h-full min-h-0 flex-1 pe-1"
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
