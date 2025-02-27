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
import { BellIcon } from "@heroicons/react/24/outline";
import { BanIcon, Check, EyeOff, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import TimeAgo from "react-time-ago";
import stringcase from "stringcase";
import Loader from "../../../app/components/loader";
import {
    useCancelRequest,
    useDismissNotification,
    useNotifications,
} from "../../../app/queries/notifications";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useNotificationsContext } from "../../contexts/NotificationContext";

export const NotificationDisplayType = {
    "video-translate": "Video translation",
};

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
        default:
            return "text-gray-500";
    }
};

export default function NotificationButton() {
    const { t } = useTranslation();
    const { isNotificationOpen, setIsNotificationOpen } =
        useNotificationsContext();
    const { data: notificationsData } = useNotifications();
    const notifications = notificationsData?.requests || []; // Extract requests from the response
    const dismissNotification = useDismissNotification();
    const [dismissingIds, setDismissingIds] = useState(new Set());
    const [cancelRequestId, setCancelRequestId] = useState(null);
    const { language } = useContext(LanguageContext);
    const router = useRouter();
    const cancelRequest = useCancelRequest();

    const handleDismiss = (requestId) => {
        setDismissingIds((prev) => new Set([...prev, requestId]));
        setTimeout(() => {
            dismissNotification.mutate(requestId);
            setDismissingIds((prev) => {
                const next = new Set(prev);
                next.delete(requestId);
                return next;
            });
        }, 300);
    };

    const handleCancelRequest = (requestId) => {
        setCancelRequestId(requestId);
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
                    <BellIcon
                        className="h-6 w-6 text-gray-500 hover:text-gray-700"
                        stroke="#0284c7"
                        fill={isNotificationOpen ? "#0284c7" : "none"}
                    />
                    {notifications.filter((n) => n.status === "in_progress")
                        .length > 0 && (
                        <>
                            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 animate-ping opacity-75" />
                            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
                                {
                                    notifications.filter(
                                        (n) => n.status === "in_progress",
                                    ).length
                                }
                            </span>
                        </>
                    )}
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-4">
                        <h3 className="font-medium">{t("Notifications")}</h3>
                        <div className="max-h-[300px] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                    {t("No recent or active notifications")}
                                </p>
                            ) : (
                                <div className="relative">
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.requestId}
                                            data-request-id={
                                                notification.requestId
                                            }
                                            className={`
                                                space-y-2 bg-gray-100 p-2 rounded-md mb-2 
                                                transform transition-all duration-300 ease-in-out
                                                ${dismissingIds.has(notification.requestId) ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"}
                                            `}
                                        >
                                            <div className="flex text-sm gap-3">
                                                <div className="ps-1 pt-1 basis-5">
                                                    <StatusIndicator
                                                        status={
                                                            notification.status
                                                        }
                                                    />
                                                </div>
                                                <div className="flex flex-col overflow-hidden grow">
                                                    <span className="font-semibold">
                                                        {t(
                                                            NotificationDisplayType[
                                                                notification
                                                                    .type
                                                            ],
                                                        )}
                                                    </span>
                                                    {notification.metadata && (
                                                        <div
                                                            className="text-xs text-gray-800 truncate"
                                                            title={
                                                                notification.statusText
                                                            }
                                                        >
                                                            {t(
                                                                "{{from}} to {{to}}",
                                                                {
                                                                    from: getLocaleShortName(
                                                                        notification
                                                                            .metadata
                                                                            .sourceLocale,
                                                                        language,
                                                                    ),
                                                                    to: getLocaleShortName(
                                                                        notification
                                                                            .metadata
                                                                            .targetLocale,
                                                                        language,
                                                                    ),
                                                                },
                                                            )}
                                                        </div>
                                                    )}
                                                    {notification.status ===
                                                        "in_progress" && (
                                                        <span className="text-xs text-gray-500">
                                                            {
                                                                notification.statusText
                                                            }
                                                        </span>
                                                    )}
                                                    {notification.status ===
                                                        "failed" && (
                                                        <span className="text-xs text-red-500">
                                                            {notification.statusText ||
                                                                t(
                                                                    "Request failed",
                                                                )}
                                                        </span>
                                                    )}
                                                    <span
                                                        className={`text-xs font-semibold ${getStatusColorClass(notification.status)}`}
                                                    >
                                                        {t(
                                                            stringcase.sentencecase(
                                                                notification.status,
                                                            ),
                                                        )}
                                                    </span>
                                                    {notification.status ===
                                                        "in_progress" && (
                                                        <div className="my-1 h-2 w-full bg-gray-200 rounded-full">
                                                            <div
                                                                className="h-full bg-sky-600 rounded-full transition-all duration-300"
                                                                style={{
                                                                    width: `${notification.progress * 100}%`,
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    {notification.createdAt && (
                                                        <span className="text-xs text-gray-500">
                                                            {t("Created ")}{" "}
                                                            <TimeAgo
                                                                date={
                                                                    notification.createdAt
                                                                }
                                                            />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    {notification.status ===
                                                        "in_progress" && (
                                                        <button
                                                            onClick={() =>
                                                                handleCancelRequest(
                                                                    notification.requestId,
                                                                )
                                                            }
                                                            className="p-1 hover:bg-gray-100 rounded flex items-start"
                                                            title={t("Cancel")}
                                                        >
                                                            <XIcon className="h-4 w-4 text-gray-500" />
                                                        </button>
                                                    )}
                                                    {(notification.status ===
                                                        "completed" ||
                                                        notification.status ===
                                                            "failed" ||
                                                        notification.status ===
                                                            "cancelled") && (
                                                        <button
                                                            onClick={() =>
                                                                handleDismiss(
                                                                    notification.requestId,
                                                                )
                                                            }
                                                            className="p-1 hover:bg-gray-100 rounded flex items-start"
                                                            title={t("Hide")}
                                                        >
                                                            <EyeOff className="h-4 w-4 text-gray-500" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
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
