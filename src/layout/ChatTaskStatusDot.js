import React from "react";
import { useTranslation } from "react-i18next";
import classNames from "../../app/utils/class-names";

/**
 * Sidebar chat status indicator:
 * - idle: static gray
 * - in_progress: pulsating gray
 * - completed: blue (finished while away / unread)
 * - failed: red
 * - needs_attention: yellow (waiting on the user)
 */
const ChatTaskStatusDot = ({
    status = "idle",
    className,
    sizeClassName = "h-2 w-2",
}) => {
    const { t } = useTranslation();
    const resolved = status || "idle";

    if (resolved === "needs_attention") {
        return (
            <span
                data-testid="sidebar-chat-attention-dot"
                className={classNames(
                    sizeClassName,
                    "shrink-0 rounded-full bg-yellow-400 dark:bg-yellow-500",
                    className,
                )}
                aria-label={t("Needs attention")}
            />
        );
    }

    if (resolved === "failed") {
        return (
            <span
                data-testid="sidebar-chat-error-dot"
                className={classNames(
                    sizeClassName,
                    "shrink-0 rounded-full bg-red-500",
                    className,
                )}
                aria-label={t("Task failed")}
            />
        );
    }

    if (resolved === "completed") {
        return (
            <span
                data-testid="sidebar-chat-unread-dot"
                className={classNames(
                    sizeClassName,
                    "shrink-0 rounded-full bg-sky-500",
                    className,
                )}
                aria-label={t("Task completed")}
            />
        );
    }

    if (resolved === "in_progress") {
        return (
            <span
                data-testid="sidebar-chat-progress-dot"
                className={classNames(
                    sizeClassName,
                    "shrink-0 rounded-full bg-gray-400 animate-pulse dark:bg-gray-500",
                    className,
                )}
                aria-label={t("Task in progress")}
            />
        );
    }

    return (
        <span
            data-testid="sidebar-chat-idle-dot"
            className={classNames(
                sizeClassName,
                "shrink-0 rounded-full bg-gray-400 dark:bg-gray-500",
                className,
            )}
            aria-hidden="true"
        />
    );
};

export default ChatTaskStatusDot;
