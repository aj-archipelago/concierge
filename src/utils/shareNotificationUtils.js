import { shareEntityUrl } from "@/components/share/shareUtils";

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
