import { shareEntityUrl } from "@/components/share/shareUtils";
import { normalizeNotificationDestination } from "./notificationDestination";

export function isShareNotification(notification) {
    return notification?.type === "resource-shared";
}

export function getShareNotificationPath(notification) {
    const metadata = notification?.metadata;
    if (!metadata) {
        return null;
    }

    if (metadata.url) {
        return metadata.url;
    }

    if (metadata.entityType && metadata.entityId) {
        return shareEntityUrl(metadata.entityType, metadata.entityId);
    }

    return null;
}

export function getShareNotificationTitle(notification, t) {
    const metadata = notification?.metadata || {};
    const entityTitle = metadata.entityTitle || t("Shared item");
    const sharedByName = metadata.sharedByName || t("Someone");

    return t("share_notification_title", {
        sharedByName,
        entityTitle,
    });
}

export function getShareNotificationSubtitle(notification, t) {
    const metadata = notification?.metadata || {};
    const entityType = metadata.entityType;
    const role = metadata.role === "editor" ? t("Editor") : t("Viewer");

    if (!entityType) {
        return role;
    }

    const typeLabel = t(`share_notification_entity_${entityType}`, {
        defaultValue: entityType,
    });

    return t("share_notification_subtitle", {
        entityType: typeLabel,
        role,
    });
}

export function getNotificationNavigationPath(notification) {
    if (notification?.team?.teamId)
        return `/teams/${encodeURIComponent(notification.team.teamId)}`;
    if (notification?.assistantProgress?.teamId)
        return `/teams/${encodeURIComponent(notification.assistantProgress.teamId)}`;
    if (notification?.assistantProgress?.chatId)
        return `/chat/${encodeURIComponent(notification.assistantProgress.chatId)}`;
    if (notification?.type === "colleague-message")
        return (
            normalizeNotificationDestination(notification.metadata?.url) ||
            (notification.metadata?.chatId
                ? `/chat/${encodeURIComponent(notification.metadata.chatId)}`
                : `/colleagues?entity=${encodeURIComponent(notification.metadata?.entityId || "")}`)
        );
    if (
        notification?.type === "automation-run" &&
        notification.automation?.automationId
    )
        return `/automations/${notification.automation.automationId}/runs/${notification._id}`;
    if (isShareNotification(notification)) {
        return getShareNotificationPath(notification);
    }

    const source = notification?.invokedFrom?.source;
    if (source === "chat" && notification.invokedFrom.chatId) {
        return `/chat/${notification.invokedFrom.chatId}`;
    }
    if (source === "video_page") {
        return "/video";
    }
    if (source === "media_page") {
        return "/media";
    }

    return null;
}
