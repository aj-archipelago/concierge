"use client";
import { TrashIcon, XIcon } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import TimeAgo from "react-time-ago";
import stringcase from "stringcase";
import {
    useDeleteNotification,
    useInfiniteNotifications,
    useCancelRequest,
} from "../../app/queries/notifications";
import {
    NotificationDisplayType,
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

export default function NotificationsPage() {
    const { t } = useTranslation();
    const { ref, inView } = useInView();

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
        useInfiniteNotifications();

    const deleteNotification = useDeleteNotification();
    const [cancelRequestId, setCancelRequestId] = useState(null);
    const cancelRequest = useCancelRequest();

    useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage]);

    const handleDelete = (requestId) => {
        if (
            window.confirm(
                t("Are you sure you want to delete this notification?"),
            )
        ) {
            deleteNotification.mutate(requestId);
        }
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

    const notifications = data?.pages.flatMap((page) => page.requests) ?? [];

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
                                key={notification.requestId}
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
                                                {t(
                                                    NotificationDisplayType[
                                                        notification.type
                                                    ],
                                                )}
                                            </span>
                                            <div className="flex gap-2">
                                                {notification.status ===
                                                    "in_progress" && (
                                                    <button
                                                        onClick={() =>
                                                            handleCancelRequest(
                                                                notification.requestId,
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
                                                                notification.requestId,
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
                                            className={`text-sm ${notification.status === "failed" ? "text-red-500" : "text-gray-500"}`}
                                        >
                                            {notification.statusText ||
                                                (notification.status ===
                                                "failed"
                                                    ? t("Request failed")
                                                    : "")}
                                        </span>
                                        <span
                                            className={`text-sm font-semibold ${getStatusColorClass(notification.status)}`}
                                        >
                                            {t(
                                                stringcase.sentencecase(
                                                    notification.status,
                                                ),
                                            )}
                                        </span>

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
