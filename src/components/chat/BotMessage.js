import { Bot, CheckCircle, XCircle, Loader2, Check } from "lucide-react";
import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useCancelTask, useTask } from "../../../app/queries/notifications";
import classNames from "../../../app/utils/class-names";
import { TASK_INFO } from "../../utils/task-info";
import CopyButton from "../CopyButton";
import { convertMessageToMarkdown } from "./ChatMessage";
import EntityIcon from "./EntityIcon";

const MemoizedMarkdownMessage = React.memo(
    ({ message, onLoad }) => {
        return convertMessageToMarkdown(message, true, onLoad);
    },
    (prevProps, nextProps) => {
        // If messages are completely identical, no need to re-render
        if (prevProps.message === nextProps.message) {
            return true;
        }

        // If payloads are strings and identical, no need to re-render
        if (
            typeof prevProps.message.payload === "string" &&
            typeof nextProps.message.payload === "string" &&
            prevProps.message.payload === nextProps.message.payload
        ) {
            return true;
        }

        // For array payloads, we need to compare each item
        if (
            Array.isArray(prevProps.message.payload) &&
            Array.isArray(nextProps.message.payload)
        ) {
            if (
                prevProps.message.payload.length !==
                nextProps.message.payload.length
            ) {
                return false;
            }

            // Compare each item in the array
            return prevProps.message.payload.every((item, index) => {
                const nextItem = nextProps.message.payload[index];
                try {
                    const prevObj =
                        typeof item === "string" ? JSON.parse(item) : item;
                    const nextObj =
                        typeof nextItem === "string"
                            ? JSON.parse(nextItem)
                            : nextItem;

                    // For image URLs, only compare the base URL without query parameters
                    if (
                        prevObj.type === "image_url" &&
                        nextObj.type === "image_url"
                    ) {
                        const prevUrl = new URL(
                            prevObj.url ||
                                prevObj.image_url?.url ||
                                prevObj.gcs,
                        ).pathname;
                        const nextUrl = new URL(
                            nextObj.url ||
                                nextObj.image_url?.url ||
                                nextObj.gcs,
                        ).pathname;
                        return prevUrl === nextUrl;
                    }

                    return JSON.stringify(prevObj) === JSON.stringify(nextObj);
                } catch (e) {
                    // If JSON parsing fails, compare as strings
                    return item === nextItem;
                }
            });
        }

        // Default to re-rendering if we can't determine equality
        return false;
    },
);

const TaskPlaceholder = ({ message, onTaskStatusUpdate }) => {
    const { data: serverTask } = useTask(message.taskId);
    const task = message.task || serverTask;

    const [displayName, setDisplayName] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [showFullOutput, setShowFullOutput] = useState(false);
    const cancelRequest = useCancelTask();
    const { t } = useTranslation();
    const statusTextScrollRef = useRef(null);
    const prevStatusTextRef = useRef(null);

    useEffect(() => {
        if (!task) {
            return;
        }

        // Use TASK_INFO directly instead of async getTaskDisplayName
        const displayName = TASK_INFO[task.type]?.displayName || task.type;
        setDisplayName(displayName);

        // Auto-expand for in-progress tasks
        if (task.status === "in_progress" || task.status === "pending") {
            if (task.progress > 0 && task.statusText) {
                setExpanded(true);
            }
        } else {
            setExpanded(false);
        }
    }, [task]);

    // Auto-scroll status text to bottom when content changes
    useEffect(() => {
        if (statusTextScrollRef.current && expanded && task?.statusText) {
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                if (statusTextScrollRef.current) {
                    statusTextScrollRef.current.scrollTop = statusTextScrollRef.current.scrollHeight;
                }
            });
        }
    }, [task?.statusText, expanded]);

    // Trigger messages list scroll when task status text changes
    useEffect(() => {
        if (task?.statusText && task.statusText !== prevStatusTextRef.current) {
            prevStatusTextRef.current = task.statusText;
            // Only trigger scroll if statusText actually changed and we have content
            if (task.statusText.trim() && onTaskStatusUpdate) {
                // Use a small delay to ensure DOM has updated
                requestAnimationFrame(() => {
                    onTaskStatusUpdate();
                });
            }
        }
    }, [task?.statusText, onTaskStatusUpdate]);

    if (!task) {
        return null;
    }

    const { status, statusText, progress, data } = task;
    const isInProgress = status === "in_progress" || status === "pending";

    const toggleExpanded = () => {
        setExpanded(!expanded);
    };

    // Add confirmation dialog handler
    const handleCancelClick = (e) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to cancel this task?")) {
            cancelRequest.mutate(message.taskId);
        }
    };

    // Helper function to convert status to sentence case
    const sentenceCase = (str) => {
        if (!str) return "";
        return str
            .replace(/_/g, " ")
            .replace(
                /\w\S*/g,
                (txt) =>
                    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
            );
    };

    // Get status badge color based on status
    const getStatusBadgeColor = (status) => {
        switch (status) {
            case "completed":
                return "bg-green-100 text-green-800 border-green-200";
            case "failed":
            case "abandoned":
            case "cancelled":
                return "bg-red-100 text-red-800 border-red-200";
            case "in_progress":
                return "bg-sky-100 text-sky-800 border-sky-200";
            case "pending":
                return "bg-yellow-100 text-yellow-800 border-yellow-200";
            default:
                return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600";
        }
    };

    return (
        <div className="">
            <div
                className="relative flex items-center gap-2 cursor-pointer font-semibold"
                onClick={toggleExpanded}
            >
                {isInProgress ? (
                    <>
                        <span className="inline-block text-transparent bg-gradient-to-r from-gray-900 via-gray-600 to-gray-900 dark:from-gray-100 dark:via-gray-400 dark:to-gray-100 bg-clip-text animate-shimmer bg-[length:200%_100%] font-semibold me-1">
                            {t(displayName)}
                        </span>
                        <svg
                            className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                            />
                        </svg>
                        <button
                            onClick={handleCancelClick}
                            className="p-1 hover:bg-gray-200 rounded-full"
                            title="Cancel task"
                        >
                            <XCircle className="w-4 h-4 text-gray-500" />
                        </button>
                    </>
                ) : (
                    <span className="font-medium flex items-center gap-1">
                        {t(displayName)}
                        <svg
                            className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                            />
                        </svg>
                        {status === "completed" && (
                            <span className="text-green-500">
                                <CheckCircle className="w-4 h-4" />
                            </span>
                        )}
                        {(status === "failed" ||
                            status === "cancelled" ||
                            status === "abandoned") && (
                            <span className="text-red-500">
                                <XCircle className="w-4 h-4" />
                            </span>
                        )}
                    </span>
                )}
            </div>
            {expanded && (
                <div className="text-gray-600 dark:text-gray-300 mt-1 ps-3 border-s-2 border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 py-2 px-3 rounded-r-md">
                    {!isInProgress && status !== "completed" && (
                        <div className="flex items-center gap-2 my-2">
                            <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(status)} border`}
                            >
                                {sentenceCase(status)}
                            </span>
                            {status === "cancelled" && (
                                <span className="text-sm text-gray-600 dark:text-gray-300">
                                    This task was cancelled by the user
                                </span>
                            )}
                        </div>
                    )}
                    {statusText && (
                        <div>
                            <div className="text-gray-600 dark:text-gray-300 text-sm font-semibold">
                                Output
                            </div>
                            <pre 
                                ref={statusTextScrollRef}
                                className="my-1 p-2 text-xs border bg-gray-50 dark:bg-gray-700 rounded-md relative whitespace-pre-wrap font-sans max-h-[140px] overflow-y-auto scroll-smooth"
                                style={{ scrollBehavior: 'smooth' }}
                            >
                                {showFullOutput || statusText.length <= 150 ? (
                                    statusText?.trim()
                                ) : (
                                    <>
                                        {statusText.trim().substring(0, 150)}...
                                        <div className="mt-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowFullOutput(true);
                                                }}
                                                className="text-sky-600 hover:text-sky-800 font-medium text-xs"
                                            >
                                                Show more
                                            </button>
                                        </div>
                                    </>
                                )}
                                {showFullOutput &&
                                    statusText.trim().length > 150 && (
                                        <div className="mt-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowFullOutput(false);
                                                }}
                                                className="text-sky-600 hover:text-sky-800 font-medium text-xs"
                                            >
                                                Show less
                                            </button>
                                        </div>
                                    )}
                            </pre>
                        </div>
                    )}
                    {progress !== undefined && progress > 0 && progress < 1 && (
                        <div className="my-2">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                                <div
                                    className="bg-sky-600 h-2.5 rounded-full"
                                    style={{ width: `${progress * 100}%` }}
                                ></div>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {Math.round(progress * 100)}% completed
                            </span>
                        </div>
                    )}
                </div>
            )}

            {!isInProgress && (
                <div className="chat-message-bot">
                    {convertMessageToMarkdown({
                        payload: data?.message || JSON.stringify(data),
                    })}
                </div>
            )}
        </div>
    );
};

// Helper function to decode HTML entities
const decodeHtmlEntities = (text) => {
    if (!text || typeof document === 'undefined') return text;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
};

export const EphemeralContent = React.memo(
    ({ content, lineStatuses = [], duration, isThinking }) => {
        const [expanded, setExpanded] = useState(true);
        const scrollContainerRef = useRef(null);
        const { t } = useTranslation();
        
        // Split content into lines and match with statuses
        const linesWithStatus = React.useMemo(() => {
            if (!content) return [];
            const lines = content.split('\n');
            // Filter to only non-empty lines for status matching
            const nonEmptyLines = lines.filter(line => line.trim() !== '');
            
            return nonEmptyLines.map((line, index) => {
                // Match line with status (lineStatuses array corresponds to non-empty lines)
                const status = lineStatuses[index] !== undefined 
                    ? lineStatuses[index] 
                    : (isThinking ? 'thinking' : 'completed');
                // Decode HTML entities like &nbsp;
                const decodedLine = decodeHtmlEntities(line);
                return { line: decodedLine, status };
            });
        }, [content, lineStatuses, isThinking]);
        
        // Auto-scroll to bottom when content changes
        useEffect(() => {
            if (scrollContainerRef.current && expanded) {
                // Use requestAnimationFrame to ensure DOM has updated
                requestAnimationFrame(() => {
                    if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                    }
                });
            }
        }, [linesWithStatus.length, expanded]);
        
        return (
            <div className="mb-2 ephemeral-content-wrapper">
                <div
                    className="relative flex items-center gap-2 cursor-pointer font-semibold text-xs"
                    onClick={() => setExpanded(!expanded)}
                >
                    <span
                        className={`inline-block ${isThinking ? "text-transparent bg-gradient-to-r from-gray-900 via-gray-600 to-gray-900 dark:from-gray-100 dark:via-gray-400 dark:to-gray-100 bg-clip-text animate-shimmer bg-[length:200%_100%]" : "text-gray-900 [.dark_&]:text-gray-100"} font-semibold me-1`}
                    >
                        {isThinking
                            ? t("Thinking...") + ` ${duration}s`
                            : t("Thought for") + ` ${duration}s`}
                    </span>
                    <svg
                        className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </div>
                {expanded && (
                    <div 
                        ref={scrollContainerRef}
                        className="text-gray-600 dark:text-gray-300 mt-1 ps-3 border-s-2 border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 py-2 px-3 rounded-r-md text-[12px] overflow-y-auto max-h-[7.5rem] scroll-smooth"
                        style={{ scrollBehavior: 'smooth' }}
                    >
                        {linesWithStatus.length > 0 ? (
                            linesWithStatus.map(({ line, status }, index) => (
                                <div key={index} className="flex items-start gap-2 mb-1 last:mb-0">
                                    <div className="flex-shrink-0 mt-0.5">
                                        {status === 'thinking' ? (
                                            <Loader2 className="h-3 w-3 text-gray-500 dark:text-gray-400 animate-spin" />
                                        ) : status === 'completed' ? (
                                            <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                                        ) : null}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {line}
                                    </div>
                                </div>
                            ))
                        ) : (
                            // Fallback to markdown rendering if no line statuses
                            convertMessageToMarkdown({
                                payload: content,
                                sender: "labeeb",
                            })
                        )}
                    </div>
                )}
            </div>
        );
    },
);

const BotMessage = ({
    message,
    toolData,
    bot,
    basis,
    buttonWidthClass,
    rowHeight,
    getLogo,
    language,
    botName,
    messageRef = () => {},
    selectedEntityId,
    entities = [],
    entityIconSize,
    onLoad,
    onTaskStatusUpdate,
}) => {
    const { t } = useTranslation();
    const { data: serverTask } = useTask(message.taskId);
    const task = message.task || serverTask;

    // Determine the entity ID to use
    const isLoader = message.id === "loading";
    // For the loader, use the selectedEntityId from props.
    // For actual messages, strictly use the entityId stored on the message.
    // Default to empty string if neither is present.
    const entityIdToUse = isLoader
        ? selectedEntityId || ""
        : message.entityId || "";

    const currentEntity = entityIdToUse
        ? entities.find((e) => e.id === entityIdToUse)
        : entities.find((e) => e.isDefault === true);

    const entityDisplaySuffix = message.taskId ? t("'s Agent") : "";

    const entityDisplayName = `${currentEntity ? currentEntity.name : botName}${entityDisplaySuffix}`;

    // Avatar rendering
    const avatar = currentEntity ? (
        <EntityIcon entity={currentEntity} size={entityIconSize} />
    ) : toolData?.avatarImage ? (
        <img
            src={toolData.avatarImage}
            alt="Tool Avatar"
            className={classNames(
                buttonWidthClass,
                rowHeight,
                "rounded-full object-cover",
            )}
            style={{
                width:
                    entityIconSize === "lg"
                        ? 32
                        : entityIconSize === "sm"
                          ? 20
                          : 16,
                height:
                    entityIconSize === "lg"
                        ? 32
                        : entityIconSize === "sm"
                          ? 20
                          : 16,
            }}
        />
    ) : bot === "code" ? (
        <Bot
            className={classNames(
                rowHeight,
                buttonWidthClass,
                "px-3",
                "text-gray-400",
            )}
            style={{
                width:
                    entityIconSize === "lg"
                        ? 32
                        : entityIconSize === "sm"
                          ? 20
                          : 16,
                height:
                    entityIconSize === "lg"
                        ? 32
                        : entityIconSize === "sm"
                          ? 20
                          : 16,
            }}
        />
    ) : (
        <img
            src={getLogo(language)}
            alt="Logo"
            className={classNames(
                buttonWidthClass,
                rowHeight,
                "p-2 rounded-full object-cover",
            )}
            style={{
                width:
                    entityIconSize === "lg"
                        ? 32
                        : entityIconSize === "sm"
                          ? 20
                          : 16,
                height:
                    entityIconSize === "lg"
                        ? 32
                        : entityIconSize === "sm"
                          ? 20
                          : 16,
            }}
        />
    );

    // Determine top padding based on entityIconSize
    const avatarTopPadding = entityIconSize === "sm" ? "pt-3" : "pt-1";

    return (
        <div
            key={message.id}
            className="flex bg-sky-50 dark:bg-gray-700 ps-1 pt-1 relative group"
        >
            <div className="flex items-center gap-2 absolute top-3 end-3">
                <CopyButton
                    item={
                        typeof message.payload === "string"
                            ? message.payload
                            : message.text
                    }
                    className="copy-button opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                />
            </div>

            <div
                className={classNames(
                    basis,
                    avatarTopPadding,
                    "flex justify-center",
                )}
            >
                {avatar}
            </div>
            <div
                className={classNames(
                    "px-1 pb-3 pt-2 [.docked_&]:px-0 [.docked_&]:py-3 w-full",
                )}
            >
                <div className="flex flex-col">
                    <div className="font-semibold">{t(entityDisplayName)}</div>
                    {message.ephemeralContent && (
                        <EphemeralContent
                            content={message.ephemeralContent}
                            duration={message.thinkingDuration ?? 0}
                            isThinking={message.isStreaming}
                        />
                    )}
                    <div
                        className="chat-message-bot relative break-words"
                        ref={(el) => messageRef(el, message.id)}
                    >
                        <React.Fragment key={`md-${message.id}`}>
                            {message.taskId && task ? (
                                <TaskPlaceholder 
                                    message={message} 
                                    onTaskStatusUpdate={onTaskStatusUpdate}
                                />
                            ) : (
                                <MemoizedMarkdownMessage
                                    message={message}
                                    onLoad={onLoad}
                                />
                            )}
                        </React.Fragment>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(BotMessage);
