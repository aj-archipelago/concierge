"use client";

import { ArrowUpRight, EyeOff } from "lucide-react";
import TimeAgo from "react-time-ago";
import ColleagueAvatar, {
    getEntityWispVariant,
} from "../colleagues/ColleagueAvatar";
import { getNotificationNavigationPath } from "../../utils/shareNotificationUtils";
import { normalizeNotificationDestination } from "../../utils/notificationDestination";

export function resolveNotificationCompanion(notification, colleagues, user) {
    const id = notification.metadata?.entityId;
    if (!id) return undefined;
    return (
        colleagues.find((colleague) => colleague.id === id) ||
        (id === user?.personalEntityId
            ? {
                  id,
                  name: user.aiName || notification.metadata.name,
                  kind: "personal",
              }
            : undefined)
    );
}

export default function ColleagueNotificationItem({
    notification,
    entity,
    router,
    setIsNotificationOpen,
    onMarkRead,
    handleDismiss,
    dismissingIds,
    t,
    actionLabel = "Hide",
    ActionIcon = EyeOff,
}) {
    const { metadata = {} } = notification;
    const path = getNotificationNavigationPath(notification);
    const destination = normalizeNotificationDestination(metadata.url);
    const companion = entity || {
        id: metadata.entityId,
        name: metadata.name,
        kind: metadata.entityKind,
        avatar: metadata.avatar,
    };
    return (
        <div
            data-request-id={notification._id}
            className={`relative mb-2 rounded-xl border transition-colors ${!notification.read ? "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30" : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"} ${dismissingIds?.has(notification._id) ? "opacity-0" : "opacity-100"}`}
        >
            <a
                href={path}
                className="flex w-full min-w-0 gap-2.5 rounded-xl p-3 text-start hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-gray-700/50"
                onClick={(event) => {
                    if (!notification.read) onMarkRead?.(notification._id);
                    if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                    )
                        return;
                    setIsNotificationOpen?.(false);
                    if (path.startsWith("/")) {
                        event.preventDefault();
                        router.push(path);
                    }
                }}
            >
                <ColleagueAvatar
                    variant={getEntityWispVariant(companion)}
                    entityId={companion.id}
                    className="mt-0.5 h-10 w-10"
                />
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-h-7 items-center gap-2 pe-7">
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {companion.name || metadata.name}
                        </span>
                        {!notification.read && (
                            <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500 dark:bg-sky-400"
                            />
                        )}
                    </div>
                    {metadata.kind === "help" && (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            {t("colleagues.helpRequested")}
                        </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        {metadata.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-gray-500 dark:text-gray-400">
                        {notification.createdAt && (
                            <TimeAgo date={notification.createdAt} />
                        )}
                        <span className="inline-flex items-center gap-0.5 text-sky-700 dark:text-sky-300">
                            {t(
                                destination
                                    ? "colleagues.openDestination"
                                    : "colleagues.chat",
                            )}
                            <ArrowUpRight
                                className="h-3 w-3"
                                aria-hidden="true"
                            />
                        </span>
                    </div>
                </div>
            </a>
            {handleDismiss && (
                <button
                    type="button"
                    title={t(actionLabel)}
                    aria-label={t(actionLabel)}
                    onClick={() =>
                        handleDismiss(notification._id, "notification")
                    }
                    className="absolute end-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                    <ActionIcon className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
