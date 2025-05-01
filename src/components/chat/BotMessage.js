import { CheckCircle, XCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AiOutlineRobot } from "react-icons/ai";
import { useTask, useCancelTask } from "../../../app/queries/notifications";
import classNames from "../../../app/utils/class-names";
import { getTaskDisplayName } from "../../utils/task-loader.mjs";
import CopyButton from "../CopyButton";
import { convertMessageToMarkdown } from "./ChatMessage";

const MemoizedMarkdownMessage = React.memo(
    ({ message }) => {
        return convertMessageToMarkdown(message);
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

const TaskPlaceholder = ({ message }) => {
    const { data: task } = useTask(message.taskId);
    const [displayName, setDisplayName] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [showFullOutput, setShowFullOutput] = useState(false);
    const cancelRequest = useCancelTask();

    useEffect(() => {
        if (!task) {
            return;
        }

        const fetchDisplayName = async () => {
            const displayName = await getTaskDisplayName(task.type);
            setDisplayName(displayName);
        };
        fetchDisplayName();

        // Auto-expand for in-progress tasks
        if (task.status === "in_progress" || task.status === "pending") {
            if (task.progress > 0 && task.statusText) {
                setExpanded(true);
            }
        } else {
            setExpanded(false);
        }
    }, [task]);

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
                return "bg-blue-100 text-blue-800 border-blue-200";
            case "pending":
                return "bg-yellow-100 text-yellow-800 border-yellow-200";
            default:
                return "bg-gray-100 text-gray-800 border-gray-200";
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
                        <span className="inline-block text-transparent bg-gradient-to-r from-gray-800 via-sky-500 to-gray-800 bg-clip-text animate-shimmer bg-[length:200%_100%] font-semibold me-1">
                            {displayName}
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
                        {displayName}
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
                <div className="text-gray-600 mt-1 ps-3 border-s-2 border-gray-400 bg-gray-100 py-2 px-3 rounded-r-md">
                    {!isInProgress && status !== "completed" && (
                        <div className="flex items-center gap-2 my-2">
                            <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(status)} border`}
                            >
                                {sentenceCase(status)}
                            </span>
                            {status === "cancelled" && (
                                <span className="text-sm text-gray-600">
                                    This task was cancelled by the user
                                </span>
                            )}
                        </div>
                    )}
                    {statusText && (
                        <div>
                            <div className="text-gray-600 text-sm font-semibold">
                                Output
                            </div>
                            <pre className="my-1 p-2 text-xs border bg-gray-50 rounded-md relative whitespace-pre-wrap font-sans max-h-[140px] overflow-y-auto">
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
                            <span className="text-xs text-gray-500">
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

export const EphemeralContent = React.memo(
    ({ content, duration, isThinking }) => {
        const [expanded, setExpanded] = useState(true);

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
                            ? `Thinking... ${duration}s`
                            : `Thought for ${duration}s`}
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
                    <div className="text-gray-600 mt-1 ps-3 border-s-2 border-gray-400 bg-gray-100 py-2 px-3 rounded-r-md text-[12px]">
                        {convertMessageToMarkdown({
                            payload: content,
                            sender: "labeeb",
                        })}
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
}) => {
    const { t } = useTranslation();

    const avatar = toolData?.avatarImage ? (
        <img
            src={toolData.avatarImage}
            alt="Tool Avatar"
            className={classNames(
                basis,
                "p-1",
                buttonWidthClass,
                rowHeight,
                "rounded-full object-cover",
            )}
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
            className={classNames(basis, "p-2", buttonWidthClass, rowHeight)}
        />
    );

    return (
        <div
            key={message.id}
            className="flex bg-sky-50 ps-1 pt-1 relative group"
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

            <div className={classNames(basis)}>{avatar}</div>
            <div
                className={classNames(
                    "px-1 pb-3 pt-2 [.docked_&]:px-0 [.docked_&]:py-3 w-full",
                )}
            >
                <div className="flex flex-col">
                    <div className="font-semibold">{t(botName)}</div>
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
                            {message.taskId ? (
                                <TaskPlaceholder message={message} />
                            ) : (
                                <MemoizedMarkdownMessage message={message} />
                            )}
                        </React.Fragment>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(BotMessage);
