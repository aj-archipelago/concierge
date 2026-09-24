"use client";

import { useInbox } from "../../app/queries/notifications";
import {
    useAutomations,
    useAutomationsLastViewedAt,
    useAutomationReadReceipts,
} from "./useAutomations";
import { isAutomationUnread } from "../utils/automationsUnread";

// Keep the sidebar indicator and Colleagues landing view in sync.
export function useColleagueUpdates() {
    const automationsQuery = useAutomations();
    const inboxQuery = useInbox();
    const { data: lastViewedAt = null } = useAutomationsLastViewedAt();
    const { data: readReceipts = {}, markRead } = useAutomationReadReceipts();
    const unreadResults = (automationsQuery.data || []).filter((task) =>
        isAutomationUnread(task, lastViewedAt, readReceipts),
    ).length;
    const unreadMessages = (inboxQuery.data?.requests || []).filter(
        (item) => item.type === "colleague-message" && !item.read,
    ).length;
    const unreadCount = unreadResults + unreadMessages;

    return {
        automationsQuery,
        lastViewedAt,
        readReceipts,
        markRead,
        unreadCount,
        hasUnreadUpdates: unreadCount > 0,
        isLoading: automationsQuery.isLoading || inboxQuery.isLoading,
    };
}
