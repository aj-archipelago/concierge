import Share from "../models/share.js";
import Chat from "../models/chat.mjs";
import Workspace from "../models/workspace.js";
import Applet from "../models/applet.js";
import Automation from "../models/automation.js";
import Article from "../models/article.js";
import {
    isShareActive,
    shareEntityUrl,
} from "@/components/share/shareUtils.js";

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

function entityKey(entityType, entityId) {
    return `${entityType}:${String(entityId)}`;
}

function toListItem({
    entityType,
    entityId,
    title,
    link,
    recipientCount,
    updatedAt,
    legacyShared = false,
}) {
    return {
        entityType,
        entityId: String(entityId),
        title: title || ENTITY_CONFIG[entityType]?.defaultTitle || "",
        url: shareEntityUrl(entityType, entityId),
        link: link || { enabled: false, role: "viewer" },
        recipientCount: recipientCount || 0,
        updatedAt: updatedAt || null,
        legacyShared: Boolean(legacyShared),
    };
}

async function loadTitles(entityType, entityIds) {
    const config = ENTITY_CONFIG[entityType];
    if (!config || entityIds.length === 0) {
        return new Map();
    }

    const docs = await config.model
        .find({ _id: { $in: entityIds } })
        .select({ [config.titleField]: 1, updatedAt: 1 })
        .lean();

    return new Map(
        docs.map((doc) => [
            String(doc._id),
            {
                title: doc[config.titleField] || config.defaultTitle,
                updatedAt: doc.updatedAt || null,
            },
        ]),
    );
}

export async function listOwnedSharedResources(ownerId) {
    const ownerKey = String(ownerId);
    const shares = await Share.find({ ownerId }).lean();
    const activeShares = shares.filter((share) => isShareActive(share));
    const coveredKeys = new Set(
        activeShares.map((share) =>
            entityKey(share.entityType, share.entityId),
        ),
    );

    const byType = activeShares.reduce((acc, share) => {
        if (!acc[share.entityType]) acc[share.entityType] = [];
        acc[share.entityType].push(share);
        return acc;
    }, {});

    const items = [];

    for (const [entityType, typeShares] of Object.entries(byType)) {
        const titles = await loadTitles(
            entityType,
            typeShares.map((share) => share.entityId),
        );

        for (const share of typeShares) {
            const meta = titles.get(String(share.entityId));
            if (!meta) continue;

            items.push(
                toListItem({
                    entityType,
                    entityId: share.entityId,
                    title: meta.title,
                    link: share.link,
                    recipientCount: share.recipients?.length || 0,
                    updatedAt: share.updatedAt || meta.updatedAt,
                }),
            );
        }
    }

    const legacyChats = await Chat.find({
        userId: ownerId,
        isPublic: true,
    })
        .select({ title: 1, updatedAt: 1 })
        .lean();

    for (const chat of legacyChats) {
        const key = entityKey("chat", chat._id);
        if (coveredKeys.has(key)) continue;

        items.push(
            toListItem({
                entityType: "chat",
                entityId: chat._id,
                title: chat.title || ENTITY_CONFIG.chat.defaultTitle,
                link: { enabled: true, role: "viewer" },
                recipientCount: 0,
                updatedAt: chat.updatedAt,
                legacyShared: true,
            }),
        );
    }

    items.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
    });

    return { items, ownerId: ownerKey };
}
