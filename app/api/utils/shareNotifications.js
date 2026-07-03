import Chat from "../models/chat.mjs";
import Workspace from "../models/workspace.js";
import Applet from "../models/applet.js";
import Automation from "../models/automation.js";
import Article from "../models/article.js";
import Notification from "../models/notification.mjs";
import { shareEntityUrl } from "@/components/share/shareUtils.js";

const ENTITY_CONFIG = {
    chat: { model: Chat, titleField: "title", defaultTitle: "Untitled chat" },
    workspace: {
        model: Workspace,
        titleField: "name",
        defaultTitle: "Untitled workspace",
    },
    applet: {
        model: Applet,
        titleField: "name",
        defaultTitle: "Untitled applet",
    },
    automation: {
        model: Automation,
        titleField: "name",
        defaultTitle: "Untitled automation",
    },
    article: {
        model: Article,
        titleField: "title",
        defaultTitle: "Untitled article",
    },
};

function recipientKey(recipient) {
    const userId = recipient?.userId?._id || recipient?.userId;
    return userId ? String(userId) : null;
}

export function findNewShareRecipients(
    previousRecipients = [],
    nextRecipients = [],
) {
    const previousKeys = new Set(
        (previousRecipients || []).map(recipientKey).filter(Boolean),
    );

    return (nextRecipients || []).filter((recipient) => {
        const key = recipientKey(recipient);
        return key && !previousKeys.has(key);
    });
}

async function loadEntityTitle(entityType, entityId) {
    const config = ENTITY_CONFIG[entityType];
    if (!config) {
        return entityType;
    }

    const doc = await config.model
        .findById(entityId)
        .select({ [config.titleField]: 1 })
        .lean();

    if (!doc) {
        return config.defaultTitle;
    }

    return doc[config.titleField] || config.defaultTitle;
}

export async function notifyNewShareRecipients({
    entityType,
    entityId,
    previousRecipients = [],
    nextRecipients = [],
    sharedBy,
    url: urlOverride,
}) {
    const addedRecipients = findNewShareRecipients(
        previousRecipients,
        nextRecipients,
    );
    if (addedRecipients.length === 0) {
        return [];
    }

    const entityTitle = await loadEntityTitle(entityType, entityId);
    const sharedByName =
        sharedBy?.name || sharedBy?.username || sharedBy?.userId || "Someone";
    const url = urlOverride || shareEntityUrl(entityType, entityId);

    const notifications = await Promise.all(
        addedRecipients.map(async (recipient) => {
            const recipientUserId = recipient.userId?._id || recipient.userId;
            if (!recipientUserId) {
                return null;
            }

            return Notification.create({
                owner: recipientUserId,
                type: "resource-shared",
                metadata: {
                    entityType,
                    entityId: String(entityId),
                    entityTitle,
                    sharedByUserId: sharedBy?._id ? String(sharedBy._id) : null,
                    sharedByName,
                    role: recipient.role || "viewer",
                    url,
                },
            });
        }),
    );

    return notifications.filter(Boolean);
}
