import React, {
    useEffect,
    useRef,
    useState,
    useCallback,
    useMemo,
} from "react";
import { convertMessageToMarkdown } from "./ChatMessage";
import { AiOutlineRobot } from "react-icons/ai";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import Loader from "../../../app/components/loader";

// Memoize the content component to prevent re-renders when only the loader position changes
const StreamingContent = React.memo(function StreamingContent({
    content,
    onContentUpdate,
}) {
    const contentRef = useRef(null);
    const markdownContent = useMemo(() => {
        return convertMessageToMarkdown({
            payload: content,
            sender: "labeeb",
        });
    }, [content]);

    useEffect(() => {
        if (contentRef.current) {
            onContentUpdate(contentRef.current);
        }
    }, [content, onContentUpdate]);

    return (
        <div
            ref={contentRef}
            className="chat-message-bot relative break-words text-gray-800"
        >
            {markdownContent}
        </div>
    );
});

const StreamingMessage = React.memo(function StreamingMessage({
    content,
    bot,
    aiName,
}) {
    const messageRef = useRef(null);
    const contentNodeRef = useRef(null);
    const [loaderPosition, setLoaderPosition] = useState({ x: 0, y: 0 });
    const [showLoader, setShowLoader] = useState(false);
    const lastUpdateRef = useRef(Date.now());
    const loaderTimeoutRef = useRef(null);
    const { t } = useTranslation();
    const { language } = i18next;
    const { getLogo } = config.global;

    const calculateLoaderPosition = useCallback((contentNode) => {
        if (!contentNode) return;

        // Get all text nodes, including those in nested elements
        const walker = document.createTreeWalker(
            contentNode,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    if (!node.textContent.trim()) {
                        return NodeFilter.FILTER_SKIP;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                },
            },
        );

        let lastTextNode = null;
        let lastNodeRect = null;

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const range = document.createRange();
            range.selectNodeContents(node);
            const rects = range.getClientRects();

            if (rects.length > 0) {
                lastTextNode = node;
                lastNodeRect = rects[rects.length - 1];
            }
        }

        if (lastTextNode && lastNodeRect) {
            const range = document.createRange();
            range.setStart(lastTextNode, lastTextNode.textContent.length);
            range.setEnd(lastTextNode, lastTextNode.textContent.length);

            const rect = range.getBoundingClientRect();
            const contentRect = contentNode.getBoundingClientRect();
            const textContainer = lastTextNode.parentElement;
            const computedStyle = window.getComputedStyle(textContainer);
            const fontSize = parseFloat(computedStyle.fontSize);
            const textMiddle = rect.top + rect.height / 2;
            const loaderHeight = 16;

            setLoaderPosition({
                x: rect.right - contentRect.left + Math.min(fontSize * 0.25, 4),
                y: textMiddle - contentRect.top - loaderHeight / 2 - 3,
            });
        }
    }, []);

    const handleContentUpdate = useCallback(
        (contentNode) => {
            if (!contentNode) return;

            contentNodeRef.current = contentNode;
            const now = Date.now();

            // Clear any existing loader timeout
            if (loaderTimeoutRef.current) {
                clearTimeout(loaderTimeoutRef.current);
                loaderTimeoutRef.current = null;
            }

            // If we're actively streaming, hide the loader and schedule showing it
            if (now - lastUpdateRef.current < 200) {
                setShowLoader(false);
            }

            // Always schedule the loader to appear after 200ms
            loaderTimeoutRef.current = setTimeout(() => {
                if (contentNodeRef.current) {
                    setShowLoader(true);
                    calculateLoaderPosition(contentNodeRef.current);
                }
            }, 200);

            lastUpdateRef.current = now;
        },
        [calculateLoaderPosition],
    );

    // Update loader position when content changes
    useEffect(() => {
        if (showLoader && contentNodeRef.current) {
            calculateLoaderPosition(contentNodeRef.current);
        }
    }, [content, showLoader, calculateLoaderPosition]);

    // Cleanup timeout
    useEffect(() => {
        return () => {
            if (loaderTimeoutRef.current) {
                clearTimeout(loaderTimeoutRef.current);
            }
        };
    }, []);

    // Scroll into view effect
    useEffect(() => {
        const scrollTimeout = setTimeout(() => {
            if (messageRef.current) {
                messageRef.current.scrollIntoView({
                    behavior: "smooth",
                    block: "end",
                });
            }
        }, 100);

        return () => clearTimeout(scrollTimeout);
    }, [content]);

    let rowHeight = "h-12 [.docked_&]:h-10";
    let basis =
        "min-w-[3rem] basis-12 [.docked_&]:basis-10 [.docked_&]:min-w-[2.5rem]";
    let buttonWidthClass = "w-12 [.docked_&]:w-10";
    const botName =
        bot === "code"
            ? config?.code?.botName
            : aiName || config?.chat?.botName;

    const avatar = useMemo(() => {
        return bot === "code" ? (
            <AiOutlineRobot
                className={classNames(
                    rowHeight,
                    buttonWidthClass,
                    "px-3",
                    "text-gray-400",
                )}
            />
        ) : (
            <img
                src={getLogo(language)}
                alt="Logo"
                className={classNames(
                    basis,
                    "p-2",
                    buttonWidthClass,
                    rowHeight,
                )}
            />
        );
    }, [bot, getLogo, language, basis, buttonWidthClass, rowHeight]);

    return (
        <div
            ref={messageRef}
            className="flex bg-sky-50 ps-1 pt-1 relative group"
        >
            <div className={classNames(basis)}>{avatar}</div>
            <div
                className={classNames(
                    "px-1 pb-3 pt-2 [.docked_&]:px-0 [.docked_&]:py-3 w-full",
                )}
            >
                <div className="flex flex-col">
                    <div className="font-semibold text-gray-900">
                        {t(botName)}
                    </div>
                    <div className="relative">
                        <StreamingContent
                            content={content}
                            onContentUpdate={handleContentUpdate}
                        />
                        {showLoader && (
                            <div className="pointer-events-none absolute top-0 left-0 w-full h-full">
                                <div
                                    className="absolute transition-transform duration-100 ease-out"
                                    style={{
                                        transform: `translate(${loaderPosition.x}px, ${loaderPosition.y}px)`,
                                    }}
                                >
                                    <Loader size="small" delay={0} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

StreamingMessage.displayName = "StreamingMessage";
export default StreamingMessage;
