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
import { EphemeralContent } from "./BotMessage";
import { predefinedEntities } from "../../config/entities";
import EntityIcon from "./EntityIcon";
import { AuthContext } from "../../App";
import { useContext } from "react";

// Memoize the content component to prevent re-renders when only the loader position changes
const StreamingContent = React.memo(function StreamingContent({
    content,
    onContentUpdate,
    isEphemeral = false,
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
            // Ensure we call onContentUpdate after the content has been rendered
            requestAnimationFrame(() => {
                onContentUpdate(contentRef.current);
            });
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
    ephemeralContent,
    bot,
    thinkingDuration,
    isThinking,
    selectedEntityId,
}) {
    const relativeContainerRef = useRef(null);
    const [loaderPosition, setLoaderPosition] = useState({ x: 0, y: 0 });
    const [showLoader, setShowLoader] = useState(true);
    const lastUpdateRef = useRef(Date.now());
    const loaderTimeoutRef = useRef(null);
    const { t } = useTranslation();
    const { language } = i18next;
    const { getLogo } = config.global;
    const { user } = useContext(AuthContext);
    const defaultAiName = user?.aiName;

    // Track if we've ever shown ephemeral content
    useEffect(() => {
        if (ephemeralContent) {
            setShowLoader(false);
        }
    }, [ephemeralContent]);

    const calculateLoaderPosition = useCallback(() => {
        const containerNode = relativeContainerRef.current;
        if (!containerNode) return;

        // Determine the last element with content
        const targetNode = containerNode.querySelector(".chat-message-bot");

        if (!targetNode) {
            return;
        }

        const walker = document.createTreeWalker(
            targetNode, // Search within the target node
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

            const textEndRect = range.getBoundingClientRect();
            const containerRect = containerNode.getBoundingClientRect();
            const textContainer = lastTextNode.parentElement;
            const computedStyle = window.getComputedStyle(textContainer);
            const fontSize = parseFloat(computedStyle.fontSize);
            const loaderHeight = 16;

            // Calculate position relative to the container
            const x =
                textEndRect.right -
                containerRect.left +
                Math.min(fontSize * 0.25, 4) +
                5;
            const y =
                textEndRect.top -
                containerRect.top +
                textEndRect.height / 2 -
                loaderHeight / 2;

            setLoaderPosition({ x, y });
        }
    }, []);

    const handleContentUpdate = useCallback(
        (contentNode) => {
            // contentNode here is the StreamingContent's div
            if (!contentNode || !relativeContainerRef.current) return;

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
                setShowLoader(true);
                calculateLoaderPosition(); // Call without args
            }, 200);

            lastUpdateRef.current = now;
        },
        [calculateLoaderPosition], // Removed direct contentNodeRef dependency
    );

    // Update loader position when content changes (or ephemeral content appears)
    useEffect(() => {
        if (showLoader) {
            // Debounce or throttle this if it causes performance issues
            calculateLoaderPosition();
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

    let rowHeight = "h-12 [.docked_&]:h-10";
    let basis =
        "min-w-[3rem] basis-12 [.docked_&]:basis-10 [.docked_&]:min-w-[2.5rem]";
    let buttonWidthClass = "w-12 [.docked_&]:w-10";
    const botName =
        selectedEntityId ||
        (bot === "code"
            ? config?.code?.botName
            : defaultAiName || config?.chat?.botName);

    const avatar = useMemo(() => {
        const currentEntity = selectedEntityId
            ? predefinedEntities.find((e) => e.id === selectedEntityId)
            : null;

        return currentEntity ? (
            <EntityIcon
                letter={currentEntity.letter}
                bgColorClass={currentEntity.bgColor}
                textColorClass={currentEntity.textColor}
                size="large"
            />
        ) : bot === "code" ? (
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
    }, [
        bot,
        getLogo,
        language,
        basis,
        buttonWidthClass,
        rowHeight,
        selectedEntityId,
    ]);

    return (
        <div className="flex bg-sky-50 ps-1 pt-1 relative group">
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
                    <div className="relative" ref={relativeContainerRef}>
                        {ephemeralContent && (
                            <EphemeralContent
                                content={ephemeralContent}
                                duration={thinkingDuration}
                                isThinking={isThinking}
                            />
                        )}
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
