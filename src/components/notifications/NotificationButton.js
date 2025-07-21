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
import { useCallback, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import TimeAgo from "react-time-ago";
import stringcase from "stringcase";
import Loader from "../../../app/components/loader";
import { useSetActiveChatId } from "../../../app/queries/chats";
import { useJob } from "../../../app/queries/jobs";
import {
    useCancelTask,
    useDismissTask,
    useRetryTask,
    useTasks,
} from "../../../app/queries/notifications";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useNotificationsContext } from "../../contexts/NotificationContext";
import { TASK_INFO } from "../../utils/task-info";
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

const NotificationItem = ({
    notification,
    handlerDisplayNames,
    isRetryable,
    language,
    setActiveChatId,
    router,
    setIsNotificationOpen,
    handleCancelRequest,
    handleDismiss,
    dismissingIds,
    t,
    handleRetry,
}) => {
    const { data: job } = useJob(notification.jobId);

    return (
        <div
            key={notification._id}
            data-request-id={notification._id}
            className={`
            space-y-2 bg-gray-100 dark:bg-gray-700 p-2 rounded-md mb-2 
            transform transition-all duration-300 ease-in-out
            ${dismissingIds.has(notification._id) ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"}
        `}
        >
            <div className="flex text-sm gap-3">
                <div className="ps-1 pt-1 basis-5">
                    <StatusIndicator status={notification.status} />
                </div>
                <div className="flex flex-col overflow-hidden grow">
                    <span
                        className={`font-semibold text-gray-800 dark:text-gray-200 ${notification.invokedFrom?.source ? "cursor-pointer hover:text-sky-600" : ""}`}
                        onClick={() => {
                            if (notification.invokedFrom?.source === "chat") {
                                setActiveChatId
                                    .mutateAsync(
                                        notification.invokedFrom.chatId,
                                    )
                                    .then(() => {
                                        router.push(
                                            `/chat/${notification.invokedFrom.chatId}`,
                                        );
                                        setIsNotificationOpen(false);
                                    })
                                    .catch((error) => {
                                        console.error(
                                            "Error setting active chat ID:",
                                            error,
                                        );
                                    });
                            } else if (
                                notification.invokedFrom?.source ===
                                "video_page"
                            ) {
                                router.push("/video");
                            }
                        }}
                    >
                        {t(
                            handlerDisplayNames[notification.type] ||
                                notification.type,
                        )}
                    </span>
                    {notification.metadata && (
                        <div
                            className="text-xs text-gray-600 dark:text-gray-400 truncate"
                            title={notification.statusText}
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
                        </div>
                    )}
                    <span
                        className={`flex items-center gap-1 text-xs font-semibold ${getStatusColorClass(notification.status)}`}
                    >
                        {t(stringcase.sentencecase(notification.status))}
                    </span>

                    {notification.statusText && (
                        <div
                            className="text-xs text-gray-600 dark:text-gray-400 truncate"
                            title={notification.statusText}
                        >
                            {notification.statusText}
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
                        <span className="text-xs text-gray-500">
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
                            <XIcon className="h-4 w-4 text-gray-500" />
                        </button>
                    )}
                    {(notification.status === "completed" ||
                        notification.status === "failed" ||
                        notification.status === "cancelled" ||
                        notification.status === "abandoned") && (
                        <button
                            onClick={() => handleDismiss(notification._id)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded flex items-start"
                            title={t("Hide")}
                        >
                            <EyeOff className="h-4 w-4 text-gray-500" />
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
                                <RotateCcw className="h-4 w-4 text-gray-500" />
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
    const { data: notificationsData } = useTasks();
    const notifications = useMemo(
        () => notificationsData?.requests || [],
        [notificationsData],
    );
    const dismissNotification = useDismissTask();
    const [dismissingIds, setDismissingIds] = useState(new Set());
    const [cancelRequestId, setCancelRequestId] = useState(null);
    const { language } = useContext(LanguageContext);
    const router = useRouter();
    const cancelRequest = useCancelTask();
    const setActiveChatId = useSetActiveChatId();
    const retryTask = useRetryTask();

    const handleDismiss = (_id) => {
        setDismissingIds((prev) => new Set([...prev, _id]));
        setTimeout(() => {
            dismissNotification.mutate(_id);
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

    return (
        <>
            <Popover
                open={isNotificationOpen}
                onOpenChange={setIsNotificationOpen}
            >
                <PopoverTrigger className="relative">
                    <Bell
                        className="h-6 w-6 text-gray-500 hover:text-gray-700"
                        stroke="#0284c7"
                        fill={isNotificationOpen ? "#0284c7" : "none"}
                    />
                    {notifications.filter(
                        (n) =>
                            n.status === "in_progress" ||
                            n.status === "pending",
                    ).length > 0 && (
                        <>
                            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 animate-ping opacity-75" />
                            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
                                {
                                    notifications.filter(
                                        (n) =>
                                            n.status === "in_progress" ||
                                            n.status === "pending",
                                    ).length
                                }
                            </span>
                        </>
                    )}
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-4">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">{t("Notifications")}</h3>
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
                                                        info.displayName,
                                                    ],
                                                ),
                                            )}
                                            isRetryable={
                                                TASK_INFO[notification.type]
                                                    ?.isRetryable
                                            }
                                            language={language}
                                            setActiveChatId={setActiveChatId}
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
