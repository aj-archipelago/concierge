import { Types } from "mongoose";
import Share, { SHARE_ROLES } from "../models/share.js";
import { isShareActive } from "@/components/share/shareUtils.js";
import { notifyNewShareRecipients } from "./shareNotifications.js";

export const VIEWER_ONLY_SHARE_ENTITY_TYPES = new Set([
    "chat",
    "workspace",
    "published_applet",
]);

export function normalizeShareRole(entityType, role) {
    if (VIEWER_ONLY_SHARE_ENTITY_TYPES.has(entityType)) {
        return "viewer";
    }
    return SHARE_ROLES.includes(role) ? role : "viewer";
}

export function normalizeShareLink(entityType, link) {
    return {
        enabled: Boolean(link?.enabled),
        role: normalizeShareRole(entityType, link?.role),
    };
}

export function computeIsShared(shareDoc, { legacyPublic = false } = {}) {
    return isShareActive(shareDoc, { legacyShared: legacyPublic });
}

export function legacyHydratedShareShape(entityType, entityId) {
    return {
        entityType,
        entityId,
        link: { enabled: true, role: "viewer" },
        recipients: [],
    };
}

export async function loadShareMap(entityType, entityIds) {
    if (!entityIds?.length) {
        return new Map();
    }

    const shares = await Share.find({
        entityType,
        entityId: { $in: entityIds },
    }).lean();

    return new Map(shares.map((share) => [String(share.entityId), share]));
}

export async function attachShareFlagsToChats(chats) {
    if (!chats?.length) {
        return chats;
    }

    const shareMap = await loadShareMap(
        "chat",
        chats.map((chat) => chat._id),
    );

    return chats.map((chat) => ({
        ...chat,
        isShared: computeIsShared(shareMap.get(String(chat._id)), {
            legacyPublic: Boolean(chat.isPublic),
        }),
    }));
}

export function sanitizeShareRecipients(raw, { ownerId, entityType }) {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw)) {
        throw new Error("recipients must be an array");
    }

    const seen = new Set();
    const out = [];

    for (const r of raw) {
        if (!r || typeof r !== "object") {
            throw new Error("Invalid recipient entry");
        }
        const userId = r.userId || r._id;
        if (!userId || !Types.ObjectId.isValid(userId)) {
            throw new Error("Invalid recipient userId");
        }
        if (String(userId) === String(ownerId)) {
            continue;
        }
        const key = String(userId);
        if (seen.has(key)) continue;
        seen.add(key);

        const role = r.role || "viewer";
        if (!SHARE_ROLES.includes(role)) {
            throw new Error("Invalid recipient role");
        }

        out.push({ userId, role: normalizeShareRole(entityType, role) });
    }
    return out;
}

export async function upsertEntityShare({
    entityType,
    entityId,
    ownerId,
    recipients,
    link,
    sharedBy,
    notificationUrl,
}) {
    const update = { $set: { ownerId } };
    if (recipients !== undefined) {
        update.$set.recipients = recipients.map((recipient) => ({
            ...recipient,
            role: normalizeShareRole(entityType, recipient.role),
        }));
    }
    if (link !== undefined)
        update.$set.link = normalizeShareLink(entityType, link);

    const previousShare = await Share.findOne({ entityType, entityId })
        .select({ recipients: 1 })
        .lean();

    const share = await Share.findOneAndUpdate(
        { entityType, entityId },
        { ...update, $setOnInsert: { entityType, entityId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (recipients !== undefined && sharedBy) {
        await notifyNewShareRecipients({
            entityType,
            entityId,
            previousRecipients: previousShare?.recipients || [],
            nextRecipients: update.$set.recipients,
            sharedBy,
            url: notificationUrl,
        });
    }

    return share;
}

export async function syncChatLinkSharing({ chatId, ownerId, linkEnabled }) {
    await Share.findOneAndUpdate(
        { entityType: "chat", entityId: chatId },
        {
            $set: {
                ownerId,
                link: { enabled: Boolean(linkEnabled), role: "viewer" },
            },
            $setOnInsert: {
                entityType: "chat",
                entityId: chatId,
                recipients: [],
            },
        },
        { upsert: true, setDefaultsOnInsert: true },
    );
}

export async function deleteEntityShare(entityType, entityId) {
    if (!entityType || !entityId) {
        return { deletedCount: 0 };
    }

    return Share.deleteMany({ entityType, entityId });
}
