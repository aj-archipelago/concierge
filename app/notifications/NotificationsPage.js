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
import { ClockIcon, TrashIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import TimeAgo from "react-time-ago";
import { toast } from "react-toastify";
import stringcase from "stringcase";
import { useJob } from "../../app/queries/jobs";
import {
    useCancelTask,
    useDeleteOldTasks,
    useDeleteTask,
    useInfiniteTasks,
} from "../../app/queries/notifications";
import {
    StatusIndicator,
    getStatusColorClass,
} from "../../src/components/notifications/NotificationButton";
import { TASK_INFO } from "../../src/utils/task-info";

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
            <pre className="my-1 p-2 text-xs border bg-gray-50 dark:bg-gray-700 rounded-md relative whitespace-pre-wrap font-sans max-h-[150px] overflow-y-auto text-gray-800 dark:text-gray-200">
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

const JobInfoBox = ({ job }) => {
    const [expanded, setExpanded] = useState(false);

    if (!job) return null;

    return (
        <div className="ms-8 bg-gray-50 dark:bg-gray-700 border rounded p-2 mt-2 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40">
            <div
                className="flex items-center justify-between cursor-pointer font-medium text-gray-800 dark:text-gray-200"
                onClick={() => setExpanded((prev) => !prev)}
                title={expanded ? "Collapse" : "Expand"}
            >
                <span>Job Info</span>
                <button
                    className="ml-2 text-xs text-sky-500 hover:underline focus:outline-none"
                    tabIndex={-1}
                    type="button"
                >
                    {expanded ? "Hide" : "Show"}
                </button>
            </div>
            {expanded && (
                <div>
                    <div>
                        <span className="font-medium">ID:</span> {job.id}
                    </div>
                    <div>
                        <span className="font-medium">State:</span> {job.state}
                    </div>
                    {job.failedReason && (
                        <div className="text-red-500">
                            <span className="font-medium">Failed Reason:</span>{" "}
                            {job.failedReason}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

function NotificationItem({
    notification,
    displayType,
    t,
    handleCancelRequest,
    handleDelete,
}) {
    const { data: job } = useJob(notification.jobId);

    return (
        <div
            key={notification._id}
            className="space-y-2 bg-gray-100 dark:bg-gray-700 p-3 rounded-md"
        >
            <div className="flex gap-3">
                <div className="ps-1 pt-1">
                    <StatusIndicator status={notification.status} />
                </div>
                <div className="flex flex-col grow overflow-hidden">
                    <div className="flex justify-between items-start">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {displayType(notification.type)}
                        </span>
                        <div className="flex gap-2">
                            {notification.status === "in_progress" && (
                                <button
                                    onClick={() =>
                                        handleCancelRequest(notification._id)
                                    }
                                    className="p-1 rounded flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                                    title={t("Cancel")}
                                >
                                    <XIcon className="h-4 w-4" />
                                </button>
                            )}
                            {(notification.status === "completed" ||
                                notification.status === "failed" ||
                                notification.status === "cancelled" ||
                                notification.status === "abandoned") && (
                                <button
                                    onClick={() =>
                                        handleDelete(notification._id)
                                    }
                                    className="p-1 rounded flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                                    title={t("Delete")}
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                    {notification.createdAt && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t("Created ")}{" "}
                            <TimeAgo date={notification.createdAt} />
                        </span>
                    )}
                    <span
                        className={`text-sm font-semibold ${getStatusColorClass(notification.status)}`}
                    >
                        {t(stringcase.sentencecase(notification.status))}
                    </span>

                    <StatusText
                        text={
                            notification.statusText ||
                            (notification.status === "failed"
                                ? t("Request failed")
                                : "")
                        }
                        id={notification._id}
                        t={t}
                    />

                    {notification.status === "in_progress" && (
                        <div className="my-2 h-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full">
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
            <JobInfoBox job={job} />
        </div>
    );
}

export default function NotificationsPage() {
    const { t } = useTranslation();
    const { ref, inView } = useInView();
    const [showDeleteOldDialog, setShowDeleteOldDialog] = useState(false);
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
        useInfiniteTasks();

    const deleteNotification = useDeleteTask();
    const [cancelRequestId, setCancelRequestId] = useState(null);
    const cancelRequest = useCancelTask();
    const deleteOldTasks = useDeleteOldTasks();

    useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage]);

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
        return TASK_INFO[type]?.displayName || type;
    };

    const handleDeleteOld = async () => {
        try {
            const result = await deleteOldTasks.mutateAsync(7);
            setShowDeleteOldDialog(false);

            if (result.deletedCount > 0) {
                toast.success(
                    t("Deleted {{count}} notifications older than 7 days.", {
                        count: result.deletedCount,
                    }),
                );
            } else {
                toast.info(t("You have no notifications older than 7 days."));
            }
        } catch (error) {
            toast.error(
                t("Failed to delete old notifications: ") + error.message,
            );
        }
    };

    return (
        <div className="p-2">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("All notifications")}</h1>
                <button
                    onClick={() => setShowDeleteOldDialog(true)}
                    disabled={deleteOldTasks.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {deleteOldTasks.isPending ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 dark:border-gray-100" />
                    ) : (
                        <ClockIcon className="h-4 w-4" />
                    )}
                    {t("Delete Old Notifications")}
                </button>
            </div>
            <div className="space-y-4">
                {status === "pending" ? (
                    <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
                    </div>
                ) : notifications.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t("No notifications")}
                    </p>
                ) : (
                    <>
                        {notifications.map((notification) => (
                            <NotificationItem
                                key={notification._id}
                                notification={notification}
                                displayType={displayType}
                                t={t}
                                handleCancelRequest={handleCancelRequest}
                                handleDelete={handleDelete}
                            />
                        ))}

                        <div ref={ref} className="py-4">
                            {isFetchingNextPage && (
                                <div className="flex justify-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            <AlertDialog
                open={showDeleteOldDialog}
                onOpenChange={setShowDeleteOldDialog}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete Old Notifications")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete all notifications older than 7 days? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOld}>
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
