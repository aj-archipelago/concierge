"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Bell,
    BanIcon,
    Check,
    Clock,
    EyeOff,
    RotateCcw,
    XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import TimeAgo from "react-time-ago";
import stringcase from "stringcase";
import Loader from "../../../app/components/loader";
import { useJob } from "../../../app/queries/jobs";
import {
    useCancelTask,
    useDismissInboxItem,
    useRetryTask,
    useInbox,
    useMarkNotificationsRead,
} from "../../../app/queries/notifications";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useNotificationsContext } from "../../contexts/NotificationContext";
import { TASK_INFO } from "../../utils/task-info";
import { getYouTubeTranscriptionAccessErrorMessage } from "../../utils/transcriptionErrors";
import {
    getShareNotificationSubtitle,
    getShareNotificationTitle,
    getNotificationNavigationPath,
    isShareNotification,
} from "../../utils/shareNotificationUtils";
const getLocaleShortName = (locale, usersLanguage) => {
    try {
        return new Intl.DisplayNames([usersLanguage], { type: "language" }).of(
            locale?.split("-")[0],
        );
    } catch (e) {
        return locale; // fallback to code if translation fails
    }
};

// Add status icons/colors mapping
export const StatusIndicator = ({ status }) => {
    if (status === "failed") {
        return <BanIcon className="h-4 w-4 text-red-500" />;
    } else if (status === "completed") {
        return <Check className="h-4 w-4 text-green-500" />;
    } else if (status === "in_progress") {
        return <Loader size="small" delay={0} />;
    } else if (status === "cancelled") {
        return <BanIcon className="h-4 w-4 text-red-500" />;
    } else if (status === "pending") {
        return <Clock className="h-4 w-4 text-yellow-500" />;
    } else if (status === "abandoned") {
        return <BanIcon className="h-4 w-4 text-red-500" />;
    } else {
        return "Unknown";
    }
};

export const getStatusColorClass = (status) => {
    switch (status) {
        case "completed":
            return "text-green-500";
        case "failed":
        case "cancelled":
            return "text-red-500";
        case "in_progress":
            return "text-sky-500";
        case "pending":
            return "text-yellow-500";
        case "abandoned":
            return "text-red-500";
        default:
            return "text-gray-500";
    }
};

function getNotificationDisplayTitle(notification, handlerDisplayNames, t) {
    if (isShareNotification(notification)) {
        return getShareNotificationTitle(notification, t);
    }

    if (notification.type === "automation-run") {
        const automationName =
            notification.automation?.name ||
            notification.metadata?.automationName ||
            notification.automation?.slug ||
            notification.metadata?.automationSlug;

        if (automationName) {
            return t("Automation: {{name}}", { name: automationName });
        }
    }

    return t(handlerDisplayNames[notification.type] || notification.type);
}

function handleNotificationNavigation({
    notification,
    router,
    setIsNotificationOpen,
    onMarkRead,
}) {
    const path = getNotificationNavigationPath(notification);
    if (!path) {
        return;
    }

    if (
        notification.inboxKind === "notification" &&
        !notification.read &&
        onMarkRead
    ) {
        onMarkRead(notification._id);
    }

    router.push(path);
    setIsNotificationOpen(false);
}

const NotificationItem = ({
    notification,
    handlerDisplayNames,
    isRetryable,
    language,
    router,
    setIsNotificationOpen,
    handleCancelRequest,
    handleDismiss,
    dismissingIds,
    t,
    handleRetry,
    onMarkRead,
}) => {
    const { data: job } = useJob(notification.jobId);
    const accessErrorMessage =
        notification.type === "transcribe"
            ? getYouTubeTranscriptionAccessErrorMessage(
                  notification.statusText,
                  t,
                  {
                      url: notification.metadata?.url,
                  },
              )
            : null;
    const statusText = accessErrorMessage || notification.statusText;
    const isClickable = Boolean(getNotificationNavigationPath(notification));
    const isUnreadNotification =
        notification.inboxKind === "notification" && !notification.read;

    return (
        <div
            key={notification._id}
            data-request-id={notification._id}
            className={`
            space-y-2 p-2 rounded-md mb-2
            transform transition-all duration-300 ease-in-out
            ${isUnreadNotification ? "bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800" : "bg-gray-100 dark:bg-gray-700"}
            ${dismissingIds.has(notification._id) ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"}
        `}
        >
            <div className="flex text-sm gap-3">
                <div className="ps-1 pt-1 basis-5">
                    {isUnreadNotification ? (
                        <span
                            className="mt-1 block h-2 w-2 rounded-full bg-sky-500"
                            aria-hidden="true"
                        />
                    ) : (
                        <StatusIndicator status={notification.status} />
                    )}
                </div>
                <div className="flex flex-col overflow-hidden grow">
                    <span
                        className={`font-semibold text-gray-800 dark:text-gray-200 ${isClickable ? "cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" : ""}`}
                        onClick={() => {
                            if (!isClickable) return;
                            handleNotificationNavigation({
                                notification,
                                router,
                                setIsNotificationOpen,
                                onMarkRead,
                            });
                        }}
                    >
                        {getNotificationDisplayTitle(
                            notification,
                            handlerDisplayNames,
                            t,
                        )}
                    </span>
                    {isShareNotification(notification) ? (
                        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {getShareNotificationSubtitle(notification, t)}
                        </div>
                    ) : null}
                    {notification.metadata &&
                    !isShareNotification(notification) ? (
                        <div
                            className="text-xs text-gray-600 dark:text-gray-400 truncate"
                            title={statusText}
                        >
                            {notification.type === "video-translate" && (
                                <>
                                    {t("{{from}} to {{to}}", {
                                        from: getLocaleShortName(
                                            notification.metadata.sourceLocale,
                                            language,
                                        ),
                                        to: getLocaleShortName(
                                            notification.metadata.targetLocale,
                                            language,
                                        ),
                                    })}
                                </>
                            )}
                            {notification.type === "transcribe" && (
                                <>
                                    {notification.metadata.url && (
                                        <span
                                            className="truncate block"
                                            title={notification.metadata.url}
                                        >
                                            {new URL(
                                                notification.metadata.url,
                                            ).pathname
                                                .split("/")
                                                .pop() ||
                                                notification.metadata.url}
                                        </span>
                                    )}
                                    {notification.metadata.language && (
                                        <span>
                                            {t("Language")}:{" "}
                                            {getLocaleShortName(
                                                notification.metadata.language,
                                                language,
                                            )}
                                        </span>
                                    )}
                                    {notification.metadata.responseFormat && (
                                        <span>
                                            {t("Format")}:{" "}
                                            {notification.metadata
                                                .responseFormat === "vtt"
                                                ? t("Subtitles")
                                                : t("Transcript")}
                                        </span>
                                    )}
                                </>
                            )}
                            {notification.type === "automation-run" && (
                                <span>
                                    {t("Trigger")}:{" "}
                                    {t(
                                        stringcase.sentencecase(
                                            notification.automation?.trigger ||
                                                notification.metadata
                                                    ?.trigger ||
                                                "manual",
                                        ),
                                    )}
                                </span>
                            )}
                        </div>
                    ) : null}
                    {!isShareNotification(notification) ? (
                        <span
                            className={`flex items-center gap-1 text-xs font-semibold ${getStatusColorClass(notification.status)}`}
                        >
                            {t(stringcase.sentencecase(notification.status))}
                        </span>
                    ) : null}

                    {statusText && (
                        <div
                            className="text-xs text-gray-600 dark:text-gray-400 truncate"
                            title={statusText}
                        >
                            {statusText}
                        </div>
                    )}
                    {(notification.status === "in_progress" ||
                        notification.status === "pending") && (
                        <div className="my-1 h-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full">
                            <div
                                className={`h-full rounded-full transition-all  ${
                                    notification.status === "pending"
                                        ? "bg-yellow-500 animate-pulse"
                                        : "bg-sky-600 duration-300"
                                }`}
                                style={{
                                    width:
                                        notification.status === "pending"
                                            ? "100%"
                                            : `${notification.progress * 100}%`,
                                }}
                            />
                        </div>
                    )}
                    {notification.createdAt && (
                        <span className="text-xs text-gray-500 dark:text-gray-300">
                            {t("Created ")}{" "}
                            <TimeAgo date={notification.createdAt} />
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    {(notification.status === "in_progress" ||
                        notification.status === "pending") && (
                        <button
                            onClick={() =>
                                handleCancelRequest(notification._id)
                            }
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded flex items-start"
                            title={t("Cancel")}
                        >
                            <XIcon className="h-4 w-4 text-gray-500 dark:text-gray-300" />
                        </button>
                    )}
                    {(notification.status === "completed" ||
                        notification.status === "failed" ||
                        notification.status === "cancelled" ||
                        notification.status === "abandoned") && (
                        <button
                            onClick={() =>
                                handleDismiss(
                                    notification._id,
                                    notification.inboxKind || "task",
                                )
                            }
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded flex items-start"
                            title={t("Hide")}
                        >
                            <EyeOff className="h-4 w-4 text-gray-500 dark:text-gray-300" />
                        </button>
                    )}
                    {job &&
                        (notification.status === "failed" ||
                            notification.status === "cancelled" ||
                            notification.status === "abandoned") &&
                        isRetryable && (
                            <button
                                onClick={() => handleRetry(notification._id)}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded flex items-start"
                                title={t("Retry")}
                            >
                                <RotateCcw className="h-4 w-4 text-gray-500 dark:text-gray-300" />
                            </button>
                        )}
                </div>
            </div>
        </div>
    );
};

export default function NotificationButton() {
    const { t } = useTranslation();
    const { isNotificationOpen, setIsNotificationOpen } =
        useNotificationsContext();
    const { data: notificationsData } = useInbox();
    const notifications = useMemo(
        () => notificationsData?.requests || [],
        [notificationsData],
    );
    const dismissNotification = useDismissInboxItem();
    const markNotificationsRead = useMarkNotificationsRead();
    const [dismissingIds, setDismissingIds] = useState(new Set());
    const [cancelRequestId, setCancelRequestId] = useState(null);
    const { language } = useContext(LanguageContext);
    const router = useRouter();
    const cancelRequest = useCancelTask();
    const retryTask = useRetryTask();
    const markNotificationsReadRef = useRef(markNotificationsRead.mutate);
    const attemptedMarkAllReadForOpenRef = useRef(false);

    useEffect(() => {
        markNotificationsReadRef.current = markNotificationsRead.mutate;
    }, [markNotificationsRead.mutate]);

    const handleDismiss = (_id, inboxKind = "task") => {
        setDismissingIds((prev) => new Set([...prev, _id]));
        setTimeout(() => {
            dismissNotification.mutate({ id: _id, inboxKind });
            setDismissingIds((prev) => {
                const next = new Set(prev);
                next.delete(_id);
                return next;
            });
        }, 300);
    };

    const handleCancelRequest = (_id) => {
        setCancelRequestId(_id);
    };

    const handleRetry = (_id) => {
        retryTask.mutate(_id);
    };

    const confirmCancel = useCallback(async () => {
        if (cancelRequestId) {
            await cancelRequest.mutate(cancelRequestId);
            setCancelRequestId(null);
        }
    }, [cancelRequestId, cancelRequest]);

    const badgeCount =
        (notificationsData?.activeTaskCount ?? 0) +
        (notificationsData?.unreadNotificationCount ?? 0);
    const hasActiveTasks = (notificationsData?.activeTaskCount ?? 0) > 0;

    const handleMarkRead = useCallback(
        (id) => {
            markNotificationsRead.mutate({ ids: [id] });
        },
        [markNotificationsRead],
    );

    useEffect(() => {
        if (!isNotificationOpen) {
            attemptedMarkAllReadForOpenRef.current = false;
            return;
        }

        if (
            attemptedMarkAllReadForOpenRef.current ||
            (notificationsData?.unreadNotificationCount ?? 0) <= 0
        ) {
            return;
        }

        attemptedMarkAllReadForOpenRef.current = true;
        markNotificationsReadRef.current({ all: true });
    }, [isNotificationOpen, notificationsData?.unreadNotificationCount]);

    return (
        <>
            <Popover
                open={isNotificationOpen}
                onOpenChange={setIsNotificationOpen}
            >
                <PopoverTrigger className="relative mt-1">
                    <Bell
                        className="h-5 w-5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        stroke="#0284c7"
                        fill={isNotificationOpen ? "#0284c7" : "none"}
                    />
                    {badgeCount > 0 && (
                        <>
                            {hasActiveTasks ? (
                                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 animate-ping opacity-75" />
                            ) : null}
                            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
                                {badgeCount}
                            </span>
                        </>
                    )}
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-4">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">
                            {t("Notifications")}
                        </h3>
                        <div className="max-h-[300px] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                    {t("No recent or active notifications")}
                                </p>
                            ) : (
                                <div className="relative">
                                    {notifications.map((notification) => (
                                        <NotificationItem
                                            key={notification._id}
                                            notification={notification}
                                            handlerDisplayNames={Object.fromEntries(
                                                Object.entries(TASK_INFO).map(
                                                    ([type, info]) => [
                                                        type,
                                                        info.displayNameKey ||
                                                            info.displayName,
                                                    ],
                                                ),
                                            )}
                                            isRetryable={
                                                TASK_INFO[notification.type]
                                                    ?.isRetryable
                                            }
                                            language={language}
                                            router={router}
                                            setIsNotificationOpen={
                                                setIsNotificationOpen
                                            }
                                            handleCancelRequest={
                                                handleCancelRequest
                                            }
                                            handleDismiss={handleDismiss}
                                            dismissingIds={dismissingIds}
                                            t={t}
                                            handleRetry={handleRetry}
                                            onMarkRead={handleMarkRead}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end">
                            <button
                                className="text-sm text-sky-500 hover:text-sky-600"
                                onClick={() => {
                                    router.push("/notifications");
                                    setIsNotificationOpen(false);
                                }}
                            >
                                {t("View history")}
                            </button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <AlertDialog
                open={!!cancelRequestId}
                onOpenChange={() => setCancelRequestId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Confirm Cancellation")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to cancel this request? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("No")}</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmCancel}>
                            {t("Yes, Cancel Request")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
