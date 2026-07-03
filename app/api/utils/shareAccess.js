import { Types } from "mongoose";
import Share, { SHARE_ENTITY_TYPES } from "../models/share.js";
import Chat from "../models/chat.mjs";
import Workspace from "../models/workspace.js";
import Applet from "../models/applet.js";
import Automation from "../models/automation.js";
import Article from "../models/article.js";

const ENTITY_LOOKUP = {
    chat: {
        model: Chat,
        ownerField: "userId",
        legacyPublicField: "isPublic",
    },
    workspace: {
        model: Workspace,
        ownerField: "owner",
        legacyPublicField: null,
    },
    applet: {
        model: Applet,
        ownerField: "owner",
        legacyPublicField: null,
    },
    automation: {
        model: Automation,
        ownerField: "owner",
        legacyPublicField: null,
    },
    article: {
        model: Article,
        ownerField: "owner",
        legacyPublicField: null,
    },
};

const NO_ACCESS = Object.freeze({
    canAccess: false,
    isOwner: false,
    role: null,
});

function sameId(a, b) {
    if (!a || !b) return false;
    return String(a) === String(b);
}

export async function getEntityOwner(entityType, entityId) {
    const config = ENTITY_LOOKUP[entityType];
    if (!config) return null;
    if (!Types.ObjectId.isValid(entityId)) return null;

    const projection = { [config.ownerField]: 1 };
    if (config.legacyPublicField) {
        projection[config.legacyPublicField] = 1;
    }

    const doc = await config.model.findById(entityId).select(projection).lean();

    if (!doc) return null;

    return {
        ownerId: doc[config.ownerField],
        legacyPublic: config.legacyPublicField
            ? Boolean(doc[config.legacyPublicField])
            : false,
    };
}

/**
 * Resolve share access when the caller already holds the entity's owner +
 * legacy-public state. Skips the redundant entity lookup. Use this inside
 * code paths that already loaded the entity.
 */
export async function resolveShareAccess({
    entityType,
    entityId,
    userId,
    ownerId,
    legacyPublic = false,
}) {
    if (!SHARE_ENTITY_TYPES.includes(entityType)) return NO_ACCESS;
    if (!Types.ObjectId.isValid(entityId)) return NO_ACCESS;

    if (userId && sameId(userId, ownerId)) {
        return { canAccess: true, isOwner: true, role: "editor" };
    }

    const share = await Share.findOne({ entityType, entityId }).lean();

    if (share) {
        if (userId && Array.isArray(share.recipients)) {
            const match = share.recipients.find((r) =>
                sameId(r.userId, userId),
            );
            if (match) {
                return {
                    canAccess: true,
                    isOwner: false,
                    role: match.role || "viewer",
                };
            }
        }
        if (share.link?.enabled) {
            return {
                canAccess: true,
                isOwner: false,
                role: share.link.role || "viewer",
            };
        }
    }

    if (legacyPublic) {
        return { canAccess: true, isOwner: false, role: "viewer" };
    }

    return NO_ACCESS;
}

export async function getShareAccess({ entityType, entityId, userId }) {
    if (!SHARE_ENTITY_TYPES.includes(entityType)) return NO_ACCESS;
    if (!Types.ObjectId.isValid(entityId)) return NO_ACCESS;

    const entity = await getEntityOwner(entityType, entityId);
    if (!entity) return NO_ACCESS;

    return resolveShareAccess({
        entityType,
        entityId,
        userId,
        ownerId: entity.ownerId,
        legacyPublic: entity.legacyPublic,
    });
}

export async function assertCanRead(args) {
    const access = await getShareAccess(args);
    if (!access.canAccess) {
        const err = new Error("Unauthorized access");
        err.status = 403;
        throw err;
    }
    return access;
}

export async function assertCanEdit(args) {
    const access = await getShareAccess(args);
    const allowed = access.isOwner || access.role === "editor";
    if (!allowed) {
        const err = new Error("Unauthorized access");
        err.status = 403;
        throw err;
    }
    return access;
}
