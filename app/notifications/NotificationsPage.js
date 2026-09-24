"use client";

import TeamNotificationItem from "../../src/components/notifications/TeamNotificationItem";
import AssistantTaskNotificationItem from "../../src/components/notifications/AssistantTaskNotificationItem";
import PageHeader from "../../src/layout/PageHeader";
import { HeaderAction } from "../../src/layout/HeaderControls";
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
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import { useRouter } from "next/navigation";
import TimeAgo from "react-time-ago";
import { toast } from "react-toastify";
import stringcase from "stringcase";
import { useJob } from "../../app/queries/jobs";
import {
    useDismissInboxItem,
    useCancelTask,
    useDeleteOldTasks,
    useDeleteInboxItem,
    useInfiniteInbox,
    useMarkNotificationsRead,
} from "../../app/queries/notifications";
import {
    StatusIndicator,
    getStatusColorClass,
} from "../../src/components/notifications/NotificationButton";
import { TASK_INFO } from "../../src/utils/task-info";
import { AuthContext } from "../../src/App";
import { useColleagues } from "../../src/hooks/useColleagues";
import ColleagueNotificationItem, {
    resolveNotificationCompanion,
} from "../../src/components/notifications/ColleagueNotificationItem";
import {
    getNotificationNavigationPath,
    getShareNotificationSubtitle,
    getShareNotificationTitle,
    isShareNotification,
} from "../../src/utils/shareNotificationUtils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import { getYouTubeTranscriptionAccessErrorMessage } from "@/src/utils/transcriptionErrors";

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
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);

    if (!job) return null;

    return (
        <div className="ms-8 bg-gray-50 dark:bg-gray-700 border rounded p-2 mt-2 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40">
            <div
                className="flex items-center justify-between cursor-pointer font-medium text-gray-800 dark:text-gray-200"
                onClick={() => setExpanded((prev) => !prev)}
                title={expanded ? t("Collapse") : t("Expand")}
            >
                <span>{t("Job Info")}</span>
                <button
                    className="ml-2 text-xs text-sky-500 hover:underline focus:outline-none"
                    tabIndex={-1}
                    type="button"
                >
                    {expanded ? t("Hide") : t("Show")}
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
    entity,
    displayType,
    t,
    handleCancelRequest,
    handleDelete,
    router,
    onMarkRead,
}) {
    const { data: job } = useJob(notification.jobId);
    const dismissItem = useDismissInboxItem();
    const navigationPath = getNotificationNavigationPath(notification);
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
    const statusText =
        accessErrorMessage ||
        notification.statusText ||
        (notification.status === "failed" ? t("Request failed") : "");
    const shareSubtitle = isShareNotification(notification)
        ? getShareNotificationSubtitle(notification, t)
        : null;
    const isUnreadNotification =
        notification.inboxKind === "notification" && !notification.read;

    if (notification.team)
        return (
            <TeamNotificationItem
                {...{ notification, router, onMarkRead, t }}
                handleDismiss={(id, inboxKind) =>
                    dismissItem.mutate({ id, inboxKind })
                }
            />
        );

    if (notification.assistantProgress)
        return (
            <AssistantTaskNotificationItem
                {...{ notification, router, handleCancelRequest, t }}
            />
        );

    if (notification.type === "colleague-message")
        return (
            <ColleagueNotificationItem
                {...{ notification, entity, router, onMarkRead, t }}
                handleDismiss={() => handleDelete(notification)}
                actionLabel="Delete"
                ActionIcon={TrashIcon}
            />
        );

    return (
        <div
            key={notification._id}
            className={`space-y-2 p-3 rounded-md ${isUnreadNotification ? "bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800" : "bg-gray-100 dark:bg-gray-700"} ${navigationPath ? "cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600/80" : ""}`}
            onClick={() => {
                if (navigationPath) {
                    if (isUnreadNotification && onMarkRead) {
                        onMarkRead(notification._id);
                    }
                    router.push(navigationPath);
                }
            }}
        >
            <div className="flex gap-3">
                <div className="ps-1 pt-1">
                    {isUnreadNotification ? (
                        <span
                            className="mt-1 block h-2 w-2 rounded-full bg-sky-500"
                            aria-hidden="true"
                        />
                    ) : (
                        <StatusIndicator status={notification.status} />
                    )}
                </div>
                <div className="flex flex-col grow overflow-hidden">
                    <div className="flex justify-between items-start">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {notification.type === "colleague-message"
                                ? t(
                                      notification.metadata?.kind === "help"
                                          ? "colleagues.needsHelp"
                                          : "colleagues.messageFrom",
                                      { name: notification.metadata?.name },
                                  )
                                : isShareNotification(notification)
                                  ? getShareNotificationTitle(notification, t)
                                  : displayType(notification.type)}
                        </span>
                        <div className="flex gap-2">
                            {["in_progress", "pending", "waiting"].includes(
                                notification.status,
                            ) && (
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleCancelRequest(notification._id);
                                    }}
                                    className="min-h-10 min-w-10 p-1 rounded flex items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
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
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleDelete(notification);
                                    }}
                                    className="min-h-10 min-w-10 p-1 rounded flex items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                                    title={t("Delete")}
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                    {shareSubtitle ? (
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                            {shareSubtitle}
                        </span>
                    ) : null}
                    {notification.createdAt && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t("Created ")}{" "}
                            <TimeAgo date={notification.createdAt} />
                        </span>
                    )}
                    {!isShareNotification(notification) ? (
                        <span
                            className={`text-sm font-semibold ${getStatusColorClass(notification.status)}`}
                        >
                            {t(
                                notification.status === "waiting"
                                    ? "colleagues.runStatus.waiting"
                                    : stringcase.sentencecase(
                                          notification.status,
                                      ),
                            )}
                        </span>
                    ) : null}

                    {notification.type === "colleague-message" && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {notification.metadata?.message}
                        </p>
                    )}
                    <StatusText text={statusText} id={notification._id} t={t} />

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
    const { user } = useContext(AuthContext);

    const router = useRouter();
    const { direction: pageDirection } = useContext(LanguageContext);
    const direction = pageDirection ?? "ltr";
    const { ref, inView } = useInView();
    const [showDeleteOldDialog, setShowDeleteOldDialog] = useState(false);
    const [deleteNotificationTarget, setDeleteNotificationTarget] =
        useState(null);
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
        useInfiniteInbox();

    const deleteNotification = useDeleteInboxItem();
    const markNotificationsRead = useMarkNotificationsRead();
    const [cancelRequestId, setCancelRequestId] = useState(null);
    const cancelRequest = useCancelTask();
    const deleteOldTasks = useDeleteOldTasks();

    useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage]);

    const handleDelete = (notification) => {
        setDeleteNotificationTarget({
            id: notification._id,
            inboxKind: notification.inboxKind || "task",
        });
    };

    const confirmDeleteNotification = useCallback(() => {
        if (deleteNotificationTarget) {
            deleteNotification.mutate(deleteNotificationTarget);
            setDeleteNotificationTarget(null);
        }
    }, [deleteNotificationTarget, deleteNotification]);

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
    const { data: colleagues = [] } = useColleagues({
        ids: [
            ...new Set(
                notifications
                    .map((item) => item.metadata?.entityId)
                    .filter(Boolean),
            ),
        ],
        limit: 100,
        status: "all",
    });

    const displayType = useCallback(
        (type) => {
            const info = TASK_INFO[type];
            if (info?.displayNameKey) return t(info.displayNameKey);
            return info?.displayName || type;
        },
        [t],
    );

    const handleMarkRead = useCallback(
        (id) => {
            markNotificationsRead.mutate({
                ids: Array.isArray(id) ? id : [id],
            });
        },
        [markNotificationsRead],
    );

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
            <PageHeader title={t("All notifications")}>
                <HeaderAction
                    icon={ClockIcon}
                    label={t("Delete Old Notifications")}
                    onClick={() => setShowDeleteOldDialog(true)}
                    disabled={deleteOldTasks.isPending}
                    aria-busy={deleteOldTasks.isPending}
                />
            </PageHeader>
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
                                entity={resolveNotificationCompanion(
                                    notification,
                                    colleagues,
                                    user,
                                )}
                                displayType={displayType}
                                t={t}
                                handleCancelRequest={handleCancelRequest}
                                handleDelete={handleDelete}
                                router={router}
                                onMarkRead={handleMarkRead}
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
                open={!!deleteNotificationTarget}
                onOpenChange={(open) => {
                    if (!open) setDeleteNotificationTarget(null);
                }}
            >
                <AlertDialogContent dir={direction}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("notification_delete_confirm_title")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("notification_delete_confirm_description")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteNotification}>
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
