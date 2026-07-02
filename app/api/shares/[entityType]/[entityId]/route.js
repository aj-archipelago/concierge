import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getCurrentUser, handleError } from "../../../utils/auth";
import Share, { SHARE_ENTITY_TYPES, SHARE_ROLES } from "../../../models/share";
import Chat from "../../../models/chat.mjs";
import { getEntityOwner } from "../../../utils/shareAccess";
import {
    legacyHydratedShareShape,
    sanitizeShareRecipients,
    upsertEntityShare,
} from "../../../utils/shareHelpers";

export const dynamic = "force-dynamic";

function badRequest(message) {
    return NextResponse.json({ error: message }, { status: 400 });
}

async function requireOwnerContext(entityType, entityId) {
    if (!SHARE_ENTITY_TYPES.includes(entityType)) {
        return { error: badRequest("Invalid entityType") };
    }
    if (!Types.ObjectId.isValid(entityId)) {
        return { error: badRequest("Invalid entityId") };
    }

    const currentUser = await getCurrentUser(false);
    if (!currentUser?._id) {
        return {
            error: NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            ),
        };
    }

    const entity = await getEntityOwner(entityType, entityId);
    if (!entity) {
        return {
            error: NextResponse.json({ error: "Not found" }, { status: 404 }),
        };
    }

    if (String(entity.ownerId) !== String(currentUser._id)) {
        return {
            error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
    }

    return {
        currentUser,
        ownerId: entity.ownerId,
        legacyPublic: entity.legacyPublic,
    };
}

function defaultShareShape(entityType, entityId) {
    return {
        entityType,
        entityId,
        link: { enabled: false, role: "viewer" },
        recipients: [],
    };
}

function sanitizeRecipientsBody(raw, { ownerId, entityType }) {
    try {
        return sanitizeShareRecipients(raw, { ownerId, entityType });
    } catch (error) {
        throw error;
    }
}

function sanitizeLinkBody(raw, { entityType }) {
    if (raw === undefined) return undefined;
    if (!raw || typeof raw !== "object") {
        throw new Error("link must be an object");
    }
    const enabled = Boolean(raw.enabled);
    let role = raw.role || "viewer";
    if (!SHARE_ROLES.includes(role)) {
        throw new Error("Invalid link role");
    }
    if (entityType === "chat") {
        role = "viewer";
    }
    return { enabled, role };
}

async function clearLegacyPublicFlag(entityType, entityId) {
    try {
        if (entityType === "chat") {
            await Chat.updateOne(
                { _id: entityId },
                { $set: { isPublic: false } },
            );
        }
    } catch (err) {
        console.warn("Failed to clear legacy public flag:", err?.message);
    }
}

export async function GET(req, { params }) {
    params = await params;
    try {
        const { entityType, entityId } = params;
        const ctx = await requireOwnerContext(entityType, entityId);
        if (ctx.error) return ctx.error;

        const share = await Share.findOne({ entityType, entityId })
            .populate("recipients.userId", "name username profilePicture")
            .lean();

        if (!share) {
            if (ctx.legacyPublic) {
                return NextResponse.json(
                    legacyHydratedShareShape(entityType, entityId),
                );
            }
            return NextResponse.json(defaultShareShape(entityType, entityId));
        }

        const recipients = (share.recipients || []).map((r) => ({
            userId: r.userId?._id || r.userId,
            role: r.role,
            addedAt: r.addedAt,
            user: r.userId?._id
                ? {
                      _id: r.userId._id,
                      name: r.userId.name,
                      username: r.userId.username,
                      profilePicture: r.userId.profilePicture,
                  }
                : null,
        }));

        return NextResponse.json({
            entityType,
            entityId,
            link: share.link || { enabled: false, role: "viewer" },
            recipients,
            updatedAt: share.updatedAt,
        });
    } catch (error) {
        return handleError(error);
    }
}

export async function PUT(req, { params }) {
    params = await params;
    try {
        const { entityType, entityId } = params;
        const ctx = await requireOwnerContext(entityType, entityId);
        if (ctx.error) return ctx.error;

        let body;
        try {
            body = await req.json();
        } catch {
            return badRequest("Invalid JSON body");
        }
        if (!body || typeof body !== "object") {
            return badRequest("Invalid body");
        }

        let link, recipients;
        try {
            link = sanitizeLinkBody(body.link, { entityType });
            recipients = sanitizeRecipientsBody(body.recipients, {
                ownerId: ctx.ownerId,
                entityType,
            });
        } catch (e) {
            return badRequest(e.message);
        }

        await upsertEntityShare({
            entityType,
            entityId,
            ownerId: ctx.ownerId,
            recipients,
            link,
            sharedBy: recipients !== undefined ? ctx.currentUser : null,
        });

        const share = await Share.findOne({ entityType, entityId })
            .populate("recipients.userId", "name username profilePicture")
            .lean();

        const sanitized = {
            entityType,
            entityId,
            link: share.link,
            recipients: (share.recipients || []).map((r) => ({
                userId: r.userId?._id || r.userId,
                role: r.role,
                addedAt: r.addedAt,
                user: r.userId?._id
                    ? {
                          _id: r.userId._id,
                          name: r.userId.name,
                          username: r.userId.username,
                          profilePicture: r.userId.profilePicture,
                      }
                    : null,
            })),
            updatedAt: share.updatedAt,
        };

        // Keep legacy chat public flag in sync with link sharing.
        if (link !== undefined && entityType === "chat") {
            const legacyVal = link.enabled === true;
            await Chat.updateOne(
                { _id: entityId },
                { $set: { isPublic: legacyVal } },
            );
        }

        return NextResponse.json(sanitized);
    } catch (error) {
        return handleError(error);
    }
}

export async function DELETE(req, { params }) {
    params = await params;
    try {
        const { entityType, entityId } = params;
        const ctx = await requireOwnerContext(entityType, entityId);
        if (ctx.error) return ctx.error;

        await Share.findOneAndDelete({ entityType, entityId });
        await clearLegacyPublicFlag(entityType, entityId);

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleError(error);
    }
}
