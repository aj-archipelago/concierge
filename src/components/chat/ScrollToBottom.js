import React, {
    useEffect,
    useRef,
    useCallback,
    useImperativeHandle,
    forwardRef,
} from "react";

const ScrollToBottom = forwardRef(
    ({ children, loadComplete, onReachTop, topOffset = 40 }, ref) => {
        const containerRef = useRef(null);
        const userHasScrolledUp = useRef(false);
        const lastScrollTop = useRef(0);
        const scrollAttempts = useRef(0);
        const maxScrollAttempts = 3; // Maximum number of scroll attempts
        const hasReachedTop = useRef(false);
        const userScrollIntentUntil = useRef(0);

        const markUserScrollIntent = useCallback(() => {
            userScrollIntentUntil.current = Date.now() + 600;
        }, []);

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

            const { scrollTop, scrollHeight, clientHeight } =
                containerRef.current;
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

        // Auto-scroll when inner content changes (e.g. during streaming).
        // StreamingMessage re-renders via its own hook without causing a
        // MessageList re-render, so the children-based effect above won't
        // fire.  A MutationObserver catches every DOM change and scrolls
        // immediately so content and scroll paint in the same frame.
        const contentRef = useRef(null);
        useEffect(() => {
            const content = contentRef.current;
            if (!content) return;

            const mo = new MutationObserver(() => {
                if (!userHasScrolledUp.current) {
                    scrollToBottom();
                }
            });
            mo.observe(content, {
                childList: true,
                subtree: true,
                characterData: true,
            });
            return () => mo.disconnect();
        }, [scrollToBottom]);

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
                    const hasRecentUserScrollIntent =
                        Date.now() <= userScrollIntentUntil.current;
                    if (
                        isScrollingUp &&
                        hasRecentUserScrollIntent &&
                        !userHasScrolledUp.current
                    ) {
                        userHasScrolledUp.current = true;
                    }

                    if (onReachTop) {
                        const canReachTop =
                            scrollHeight - clientHeight > topOffset;
                        if (canReachTop) {
                            if (
                                scrollTop <= topOffset &&
                                !hasReachedTop.current
                            ) {
                                hasReachedTop.current = true;
                                onReachTop();
                            } else if (scrollTop > topOffset * 2) {
                                hasReachedTop.current = false;
                            }
                        }
                    }

                    // If we reach bottom, re-enable auto-scroll
                    const isAtBottom =
                        Math.abs(scrollTop + clientHeight - scrollHeight) < 10;
                    if (isAtBottom) {
                        userHasScrolledUp.current = false;
                    }
                }}
                onWheel={markUserScrollIntent}
                onTouchMove={markUserScrollIntent}
                onPointerDown={markUserScrollIntent}
                onKeyDown={markUserScrollIntent}
                tabIndex={-1}
            >
                <div ref={contentRef}>{children}</div>
            </div>
        );
    },
);

export default ScrollToBottom;
