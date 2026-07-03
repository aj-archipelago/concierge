import { NextResponse } from "next/server";
import Article from "../../../models/article.js";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { findArticleForAccess } from "../../utils.js";
import {
    fetchOwnerArticleHtml,
    getOwnerContextId,
    resolveArticleBlobPath,
} from "../../content-utils.js";
import { uploadBufferToMediaService } from "../../../utils/media-service-utils.js";
import { createArticleStorageTarget } from "../../../../../src/utils/storageTargets.js";

export const dynamic = "force-dynamic";

function deriveFilename(article) {
    if (article.filename) return article.filename;
    const path = article.workspacePath || "";
    const parts = path.split("/");
    return parts[parts.length - 1] || "article.html";
}

export async function GET(_req, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser(false);
        const loaded = await findArticleForAccess(params.id, user?._id);
        if (!loaded.ok) {
            return NextResponse.json(
                { error: loaded.error },
                { status: loaded.status },
            );
        }

        const result = await fetchOwnerArticleHtml(loaded.article);
        if (!result.ok) {
            return NextResponse.json(
                { error: result.error },
                { status: result.status },
            );
        }

        return new Response(result.html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        return handleError(error);
    }
}

export async function PUT(req, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser(false);
        const loaded = await findArticleForAccess(params.id, user?._id);
        if (!loaded.ok) {
            return NextResponse.json(
                { error: loaded.error },
                { status: loaded.status },
            );
        }
        if (loaded.readOnly) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const html = await req.text();
        if (!html?.trim()) {
            return NextResponse.json(
                { error: "Article content is required" },
                { status: 400 },
            );
        }

        const ownerContextId = await getOwnerContextId(loaded.article.owner);
        if (!ownerContextId) {
            return NextResponse.json(
                { error: "Unable to save article" },
                { status: 400 },
            );
        }

        const filename = deriveFilename(loaded.article);
        const upload = await uploadBufferToMediaService(
            Buffer.from(html, "utf-8"),
            {
                filename,
                mimeType: "text/html; charset=utf-8",
            },
            {
                storageTarget: createArticleStorageTarget(ownerContextId),
            },
        );

        if (upload.error) {
            return upload.error;
        }

        const data = upload.data || {};
        const blobPath =
            data.blobPath || resolveArticleBlobPath(loaded.article);

        await Article.updateOne(
            { _id: loaded.article._id },
            {
                $set: {
                    fileHash: data.hash || loaded.article.fileHash || null,
                    blobPath,
                    filename: data.displayFilename || filename,
                },
            },
        );

        return NextResponse.json({
            fileHash: data.hash || null,
            blobPath,
            filename: data.displayFilename || filename,
        });
    } catch (error) {
        return handleError(error);
    }
}
