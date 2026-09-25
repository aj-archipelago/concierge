"use client";

import { useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../../App";
import {
    useInbox,
    useMarkNotificationsRead,
} from "../../../app/queries/notifications";
import ColleagueNotificationItem, {
    resolveNotificationCompanion,
} from "../notifications/ColleagueNotificationItem";

export default function ColleagueMessages({ colleagues, assigneeId }) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const router = useRouter();
    const { data, error } = useInbox();
    const markRead = useMarkNotificationsRead();
    const messages = (data?.requests || []).filter(
        (item) =>
            item.type === "colleague-message" &&
            !item.read &&
            (!assigneeId || item.metadata?.entityId === assigneeId),
    );
    if (!messages.length && !error) return null;
    return (
        <section
            aria-label={t("colleagues.unreadMessages")}
            className="space-y-3"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">
                    {t("colleagues.unreadMessages")}
                </h2>
                <Link
                    href="/notifications"
                    className="inline-flex min-h-10 items-center rounded-md text-sm text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300"
                >
                    {t("All notifications")}
                </Link>
            </div>
            {error && (
                <p
                    role="alert"
                    className="text-sm text-red-700 dark:text-red-300"
                >
                    {t("colleagues.messagesError")}
                </p>
            )}
            <div className="min-w-0 space-y-3">
                {messages.slice(0, 4).map((notification) => (
                    <ColleagueNotificationItem
                        key={notification._id}
                        notification={notification}
                        entity={resolveNotificationCompanion(
                            notification,
                            colleagues,
                            user,
                        )}
                        router={router}
                        onMarkRead={(id) => markRead.mutate({ ids: [id] })}
                        t={t}
                    />
                ))}
            </div>
        </section>
    );
}
