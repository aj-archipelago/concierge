"use client";
import { TrashIcon, XIcon } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import TimeAgo from "react-time-ago";
import stringcase from "stringcase";
import {
    useDeleteTask,
    useInfiniteTasks,
    useCancelTask,
} from "../../app/queries/notifications";
import {
    StatusIndicator,
    getStatusColorClass,
} from "../../src/components/notifications/NotificationButton";
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
import { getTaskDisplayName } from "../../src/utils/task-loader.mjs";

const StatusText = ({ text, id, t }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!text) return null;

    text = text?.trim();

    const toggleExpanded = (e) => {
        e.stopPropagation();
        setIsExpanded((prev) => !prev);
    };

    return (
        <div>
            <pre className="my-1 p-2 text-xs border bg-gray-50 rounded-md relative whitespace-pre-wrap font-sans max-h-[150px] overflow-y-auto">
                {isExpanded || (text?.length || 0) <= 150 ? (
                    text?.trim()
                ) : (
                    <>
                        {text?.substring(0, 150)}...
                        <div className="mt-1">
                            <button
                                onClick={toggleExpanded}
                                className="text-sky-600 hover:text-sky-800 font-medium text-xs"
                            >
                                {t("Show more")}
                            </button>
                        </div>
                    </>
                )}
                {isExpanded && text?.length > 150 && (
                    <div className="mt-1">
                        <button
                            onClick={toggleExpanded}
                            className="text-sky-600 hover:text-sky-800 font-medium text-xs"
                        >
                            {t("Show less")}
                        </button>
                    </div>
                )}
            </pre>
        </div>
    );
};

export default function NotificationsPage() {
    const { t } = useTranslation();
    const { ref, inView } = useInView();

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
        useInfiniteTasks();

    const deleteNotification = useDeleteTask();
    const [cancelRequestId, setCancelRequestId] = useState(null);
    const cancelRequest = useCancelTask();
    const [notificationTypes, setNotificationTypes] = useState({});

    useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage]);

    useEffect(() => {
        // Load all notification types for displayed notifications
        const loadTypes = async () => {
            const types = {};
            for (const notification of data?.pages.flatMap(
                (page) => page.requests,
            ) ?? []) {
                if (!types[notification.type]) {
                    types[notification.type] = await getTaskDisplayName(
                        notification.type,
                    );
                }
            }
            setNotificationTypes(types);
        };
        loadTypes();
    }, [data]);

    const handleDelete = (_id) => {
        if (
            window.confirm(
                t("Are you sure you want to delete this notification?"),
            )
        ) {
            deleteNotification.mutate(_id);
        }
    };

    const handleCancelRequest = (_id) => {
        setCancelRequestId(_id);
    };

    const confirmCancel = useCallback(async () => {
        if (cancelRequestId) {
            await cancelRequest.mutate(cancelRequestId);
            setCancelRequestId(null);
        }
    }, [cancelRequestId, cancelRequest]);

    const notifications = data?.pages.flatMap((page) => page.requests) ?? [];

    const displayType = (type) => {
        return notificationTypes[type] || type;
    };

    return (
        <div className="p-2">
            <h1 className="text-2xl font-bold mb-6">
                {t("All notifications")}
            </h1>
            <div className="space-y-4">
                {status === "pending" ? (
                    <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
                    </div>
                ) : notifications.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        {t("No notifications")}
                    </p>
                ) : (
                    <>
                        {notifications.map((notification) => (
                            <div
                                key={notification._id}
                                className="space-y-2 bg-gray-100 p-3 rounded-md"
                            >
                                <div className="flex gap-3">
                                    <div className="ps-1 pt-1">
                                        <StatusIndicator
                                            status={notification.status}
                                        />
                                    </div>
                                    <div className="flex flex-col grow overflow-hidden">
                                        <div className="flex justify-between items-start">
                                            <span className="font-semibold">
                                                {displayType(notification.type)}
                                            </span>
                                            <div className="flex gap-2">
                                                {notification.status ===
                                                    "in_progress" && (
                                                    <button
                                                        onClick={() =>
                                                            handleCancelRequest(
                                                                notification._id,
                                                            )
                                                        }
                                                        className="p-1 rounded flex items-center gap-1 text-sm text-gray-500 hover:text-red-500"
                                                        title={t("Cancel")}
                                                    >
                                                        <XIcon className="h-4 w-4" />
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
                                                            handleDelete(
                                                                notification._id,
                                                            )
                                                        }
                                                        className="p-1 rounded flex items-center gap-1 text-sm text-gray-500 hover:text-red-500"
                                                        title={t("Delete")}
                                                    >
                                                        <TrashIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
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
                                        <span
                                            className={`text-sm font-semibold ${getStatusColorClass(notification.status)}`}
                                        >
                                            {t(
                                                stringcase.sentencecase(
                                                    notification.status,
                                                ),
                                            )}
                                        </span>

                                        <StatusText
                                            text={
                                                notification.statusText ||
                                                (notification.status ===
                                                "failed"
                                                    ? t("Request failed")
                                                    : "")
                                            }
                                            id={notification._id}
                                            t={t}
                                        />

                                        {notification.status ===
                                            "in_progress" && (
                                            <div className="my-2 h-2 w-full bg-gray-200 rounded-full">
                                                <div
                                                    className="h-full bg-sky-600 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${notification.progress * 100}%`,
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div ref={ref} className="py-4">
                            {isFetchingNextPage && (
                                <div className="flex justify-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
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
        </div>
    );
}
