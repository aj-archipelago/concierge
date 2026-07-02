import User from "../models/user";

const MEDIA_HELPER_URL =
    process.env.CORTEX_MEDIA_API_URL || "http://localhost:5000";

export async function getOwnerContextId(ownerId) {
    const owner = await User.findById(ownerId).select("contextId").lean();
    return owner?.contextId || null;
}

export function resolveArticleBlobPath(article) {
    return (
        article.blobPath ||
        article.workspacePath.replace(/^\/workspace\/files\/?/, "")
    );
}

export async function fetchOwnerArticleHtml(article) {
    const ownerContextId = await getOwnerContextId(article.owner);
    if (!ownerContextId) {
        return { ok: false, status: 404, error: "Article file not found" };
    }

    const blobPath = resolveArticleBlobPath(article);

    const lookupUrl = new URL(MEDIA_HELPER_URL);
    lookupUrl.searchParams.set("blobPath", blobPath);
    lookupUrl.searchParams.set("userId", ownerContextId);

    const lookupRes = await fetch(lookupUrl.toString());
    if (!lookupRes.ok) {
        return { ok: false, status: 404, error: "Article file not found" };
    }

    const lookupData = await lookupRes.json();
    const fileUrl = lookupData.shortLivedUrl || lookupData.url;
    if (!fileUrl) {
        return { ok: false, status: 404, error: "Article file not found" };
    }

    const contentRes = await fetch(fileUrl);
    if (!contentRes.ok) {
        return {
            ok: false,
            status: 502,
            error: "Failed to fetch article content",
        };
    }

    return { ok: true, html: await contentRes.text() };
}
