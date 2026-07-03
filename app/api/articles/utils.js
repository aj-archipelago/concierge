import { Types } from "mongoose";
import Article from "../models/article.js";
import User from "../models/user";
import { resolveShareAccess } from "../utils/shareAccess.js";

export async function findArticleForAccess(articleId, userId) {
    if (!articleId || !Types.ObjectId.isValid(articleId)) {
        return { ok: false, status: 400, error: "Invalid article id" };
    }

    const article = await Article.findById(articleId).lean();
    if (!article) {
        return { ok: false, status: 404, error: "Article not found" };
    }

    const access = await resolveShareAccess({
        entityType: "article",
        entityId: article._id,
        userId,
        ownerId: article.owner,
    });

    if (!access.canAccess) {
        return { ok: false, status: 404, error: "Article not found" };
    }

    const readOnly = !access.isOwner && access.role !== "editor";
    let owner = null;
    if (!access.isOwner) {
        owner = await User.findById(article.owner)
            .select("name username profilePicture")
            .lean();
    }

    return {
        ok: true,
        article,
        access,
        readOnly,
        owner,
    };
}

export function serializeArticle(article, { access, readOnly, owner } = {}) {
    return {
        _id: String(article._id),
        title: article.title || "",
        workspacePath: article.workspacePath,
        fileHash: article.fileHash || null,
        blobPath: article.blobPath || null,
        filename: article.filename || null,
        isOwner: access?.isOwner === true,
        isShared: access?.canAccess === true && !access?.isOwner,
        shareRole: access?.role || null,
        readOnly: Boolean(readOnly),
        owner: owner
            ? {
                  name: owner.name || null,
                  username: owner.username || null,
                  profilePicture: owner.profilePicture || null,
              }
            : null,
        updatedAt: article.updatedAt || null,
    };
}
