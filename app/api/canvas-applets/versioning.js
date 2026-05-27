import {
    deleteMediaFile,
    hashBuffer,
    readBlobContent,
    uploadBufferToMediaService,
} from "../utils/media-service-utils";
import Applet from "../models/applet";
import {
    createAppletGlobalStorageTarget,
    createAppletPublishedStorageTarget,
    getStorageContextId,
} from "../../../src/utils/storageTargets";

export function extractAppletVersionBlobPathFromUrl(blobUrl) {
    try {
        const urlObj = new URL(blobUrl);
        const segments = urlObj.pathname.split("/").filter(Boolean);
        const isAzurite =
            urlObj.hostname === "127.0.0.1" || urlObj.hostname === "localhost";
        const skip = isAzurite ? 2 : 1;
        if (segments.length <= skip) return null;
        return segments.slice(skip).map(decodeURIComponent).join("/");
    } catch {
        return null;
    }
}

export function getAppletVersionBlobPath(version) {
    return (
        version?.contentBlobPath ||
        extractAppletVersionBlobPathFromUrl(version?.contentUrl) ||
        null
    );
}

function appletIdOf(applet) {
    return applet?._id?.toString?.() || String(applet?._id || "");
}

function formatVersionNumber(versionIndex = 0) {
    return String(Math.max(0, versionIndex) + 1).padStart(6, "0");
}

function formatTimestampForFilename(date = new Date()) {
    return date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
}

function snapshotBlobPath(data) {
    return (
        (data.converted?.url
            ? data.converted?.blobPath ||
              extractAppletVersionBlobPathFromUrl(data.converted.url)
            : null) ||
        data.blobPath ||
        data.blobName ||
        extractAppletVersionBlobPathFromUrl(data.url)
    );
}

async function writeHtmlSnapshot({
    applet,
    html,
    storageTarget,
    subPath,
    versionIndex = 0,
    errorLabel,
}) {
    const normalizedHtml = typeof html === "string" ? html : "";
    const buffer = Buffer.from(normalizedHtml, "utf8");
    const hash = await hashBuffer(buffer);
    const appletId = appletIdOf(applet);
    if (!appletId) {
        throw new Error(`Cannot store ${errorLabel} without applet ID`);
    }

    const filename = `v${formatVersionNumber(versionIndex)}-${formatTimestampForFilename()}.html`;
    const uploadResult = await uploadBufferToMediaService(
        buffer,
        {
            filename,
            mimeType: "text/html",
            size: buffer.length,
            hash,
        },
        {
            storageTarget,
            subPath,
        },
    );

    if (uploadResult?.error || !uploadResult?.data?.url) {
        throw new Error(`Failed to store ${errorLabel}`);
    }

    const data = uploadResult.data;
    const blobPath = snapshotBlobPath(data);
    if (!blobPath) {
        throw new Error(`Failed to store ${errorLabel} blob path`);
    }

    return {
        url: data.converted?.url || data.url,
        blobPath,
        hash: data.hash || hash,
        size: buffer.length,
        contextId: getStorageContextId({ storageTarget }),
    };
}

export async function createAppletHtmlSnapshot(
    applet,
    user,
    html,
    { versionIndex = 0 } = {},
) {
    if (!user?.contextId) {
        throw new Error(
            "Cannot store applet version HTML without user context",
        );
    }

    const appletId = appletIdOf(applet);
    return writeHtmlSnapshot({
        applet,
        html,
        storageTarget: createAppletGlobalStorageTarget(user.contextId),
        subPath: `versions/${appletId}`,
        versionIndex,
        errorLabel: "applet version HTML",
    });
}

export async function createPublishedAppletHtmlSnapshot(
    applet,
    html,
    { versionIndex = 0 } = {},
) {
    const appletId = appletIdOf(applet);
    const storageTarget = createAppletPublishedStorageTarget();
    return writeHtmlSnapshot({
        applet,
        html,
        storageTarget,
        subPath: `published/${appletId}`,
        versionIndex,
        errorLabel: "published applet HTML",
    });
}

function buildExternalVersionEntry(snapshot) {
    return {
        content: "",
        contentUrl: snapshot.url,
        contentBlobPath: snapshot.blobPath,
        contentHash: snapshot.hash,
        contentSize: snapshot.size,
        contentContextId: snapshot.contextId,
        timestamp: new Date(),
    };
}

function buildInlineVersionEntry(html) {
    return {
        content: typeof html === "string" ? html : "",
        timestamp: new Date(),
    };
}

export async function createAppletVersionEntry(
    applet,
    user,
    html,
    { versionIndex = 0, external = true } = {},
) {
    if (!external) {
        return buildInlineVersionEntry(html);
    }
    const snapshot = await createAppletHtmlSnapshot(applet, user, html, {
        versionIndex,
    });
    return buildExternalVersionEntry(snapshot);
}

function buildPublishedContentUpdate(snapshot, versionIndex) {
    return {
        publishedContentUrl: snapshot.url,
        publishedContentBlobPath: snapshot.blobPath,
        publishedContentHash: snapshot.hash,
        publishedContentSize: snapshot.size,
        publishedContentContextId: snapshot.contextId,
        publishedContentVersionIndex:
            typeof versionIndex === "number" ? versionIndex : null,
        publishedContentTimestamp: new Date(),
    };
}

export function getPublishedAppletSnapshot(applet) {
    return {
        publishedContentBlobPath: applet?.publishedContentBlobPath,
        publishedContentHash: applet?.publishedContentHash,
        publishedContentContextId: applet?.publishedContentContextId,
    };
}

export function clearPublishedContentFields(applet) {
    applet.publishedContentUrl = undefined;
    applet.publishedContentBlobPath = undefined;
    applet.publishedContentHash = undefined;
    applet.publishedContentSize = undefined;
    applet.publishedContentContextId = undefined;
    applet.publishedContentVersionIndex = undefined;
    applet.publishedContentTimestamp = undefined;
}

async function resolveAppletVersionSnapshot(version) {
    if (typeof version?.content === "string" && version.content.length > 0) {
        return { content: version.content, missing: false };
    }

    const blobPath = getAppletVersionBlobPath(version);
    if (!blobPath || !version?.contentContextId) {
        return { content: version?.content || "", missing: false };
    }

    const content = await readBlobContent(
        blobPath,
        createAppletGlobalStorageTarget(version.contentContextId),
    );

    return {
        content: content || "",
        contentBlobPath: blobPath,
        missing: content == null,
    };
}

export async function resolveAppletVersionContent(version) {
    const snapshot = await resolveAppletVersionSnapshot(version);
    return snapshot.content;
}

async function resolveCanonicalPublishedAppletContent(applet) {
    const publishedBlobPath =
        applet?.publishedContentBlobPath ||
        extractAppletVersionBlobPathFromUrl(applet?.publishedContentUrl) ||
        null;

    if (!publishedBlobPath) {
        return null;
    }

    return readBlobContent(
        publishedBlobPath,
        createAppletPublishedStorageTarget(applet?.publishedContentContextId),
    );
}

export async function resolvePublishedAppletContent(applet) {
    const canonicalContent =
        await resolveCanonicalPublishedAppletContent(applet);
    if (canonicalContent != null) {
        return canonicalContent;
    }

    const publishedVersion =
        applet?.publishedVersionIndex != null
            ? applet.htmlVersions?.[applet.publishedVersionIndex]
            : null;
    return publishedVersion
        ? ((await resolveAppletVersionContent(publishedVersion)) ?? null)
        : null;
}

export async function createPublishedAppletUpdate(
    applet,
    html,
    { versionIndex = 0 } = {},
) {
    const snapshot = await createPublishedAppletHtmlSnapshot(applet, html, {
        versionIndex,
    });
    return buildPublishedContentUpdate(snapshot, versionIndex);
}

export async function applyPublishedAppletSnapshot(
    applet,
    html,
    { versionIndex = 0 } = {},
) {
    const previousPublishedSnapshot = getPublishedAppletSnapshot(applet);
    const update = await createPublishedAppletUpdate(applet, html, {
        versionIndex,
    });
    Object.assign(applet, update);
    return {
        previousPublishedSnapshot,
        nextPublishedSnapshot: getPublishedAppletSnapshot(applet),
    };
}

export async function deletePublishedAppletSnapshot(
    applet,
    { allowHashFallback = true } = {},
) {
    if (!applet?.publishedContentBlobPath && !applet?.publishedContentHash) {
        return null;
    }

    return deleteMediaFile({
        blobPath: applet.publishedContentBlobPath || null,
        hash:
            allowHashFallback || !applet.publishedContentBlobPath
                ? applet.publishedContentHash || null
                : null,
        storageTarget: createAppletPublishedStorageTarget(
            applet.publishedContentContextId,
        ),
    });
}

export async function deleteReplacedPublishedAppletSnapshot(previous, next) {
    const previousBlobPath = previous?.publishedContentBlobPath || null;
    const previousHash = previous?.publishedContentHash || null;
    if (!previousBlobPath && !previousHash) {
        return null;
    }

    const nextBlobPath = next?.publishedContentBlobPath || null;
    const nextHash = next?.publishedContentHash || null;
    const sameBlobPath = previousBlobPath && previousBlobPath === nextBlobPath;
    const sameHashOnly =
        !previousBlobPath &&
        !nextBlobPath &&
        previousHash &&
        previousHash === nextHash;
    if (sameBlobPath || sameHashOnly) {
        return null;
    }

    return deletePublishedAppletSnapshot(previous, {
        allowHashFallback: !previousBlobPath,
    });
}

function canRepairPublishedVersionSnapshot(applet, user, resolvedVersions) {
    if (Number(applet?.version || 1) !== 2 || !user?.contextId) {
        return false;
    }
    const publishedIndex =
        typeof applet?.publishedVersionIndex === "number"
            ? applet.publishedVersionIndex
            : null;
    if (publishedIndex == null || !resolvedVersions[publishedIndex]?.missing) {
        return false;
    }
    if (
        typeof applet?.publishedContentVersionIndex === "number" &&
        applet.publishedContentVersionIndex !== publishedIndex
    ) {
        return false;
    }
    return !!(applet?.publishedContentBlobPath || applet?.publishedContentUrl);
}

async function repairPublishedVersionSnapshot(applet, user, resolvedVersions) {
    if (!canRepairPublishedVersionSnapshot(applet, user, resolvedVersions)) {
        return false;
    }

    const publishedIndex = applet.publishedVersionIndex;
    const canonicalHtml = await resolveCanonicalPublishedAppletContent(applet);
    if (canonicalHtml == null) {
        return false;
    }

    const snapshot = await createAppletHtmlSnapshot(
        applet,
        user,
        canonicalHtml,
        {
            versionIndex: publishedIndex,
        },
    );
    const entry = resolvedVersions[publishedIndex];
    entry.version = {
        ...entry.version,
        content: "",
        contentUrl: snapshot.url,
        contentBlobPath: snapshot.blobPath,
        contentHash: snapshot.hash,
        contentSize: snapshot.size,
        contentContextId: snapshot.contextId,
        timestamp: entry.version?.timestamp || new Date(),
    };
    entry.content = canonicalHtml;
    entry.contentBlobPath = snapshot.blobPath;
    entry.missing = false;
    entry.repaired = true;
    return true;
}

export async function hydrateAppletVersionContents(applet, user = null) {
    const versions = Array.isArray(applet?.htmlVersions)
        ? applet.htmlVersions
        : [];
    if (
        !versions.some(
            (version) => version?.contentBlobPath || version?.contentUrl,
        )
    ) {
        return applet;
    }

    const resolvedVersions = await Promise.all(
        versions.map(async (version) => ({
            version,
            ...(await resolveAppletVersionSnapshot(version)),
        })),
    );
    let healedPublishedVersion = false;
    try {
        healedPublishedVersion = await repairPublishedVersionSnapshot(
            applet,
            user,
            resolvedVersions,
        );
    } catch (error) {
        console.warn(
            "hydrateAppletVersionContents: failed to repair published version snapshot:",
            error?.message,
        );
    }

    const hydratedVersions = resolvedVersions.map((entry) => ({
        ...entry.version,
        ...(entry.contentBlobPath
            ? { contentBlobPath: entry.contentBlobPath }
            : {}),
        content: entry.missing ? entry.version?.content || "" : entry.content,
    }));
    const persistedVersions = resolvedVersions.map((entry) => ({
        ...entry.version,
        ...(!entry.missing && entry.contentBlobPath
            ? { contentBlobPath: entry.contentBlobPath }
            : {}),
    }));
    const repaired = resolvedVersions.some(
        (entry) =>
            entry.repaired ||
            (!entry.missing &&
                entry.contentBlobPath &&
                entry.contentBlobPath !== entry.version?.contentBlobPath),
    );

    if ((repaired || healedPublishedVersion) && applet?._id) {
        try {
            await Applet.findByIdAndUpdate(applet._id, {
                htmlVersions: persistedVersions,
                publishedVersionIndex: applet?.publishedVersionIndex,
            });
        } catch (error) {
            console.warn(
                "hydrateAppletVersionContents: failed to persist repaired version metadata:",
                error?.message,
            );
        }
    }

    return {
        ...applet,
        htmlVersions: hydratedVersions,
        publishedVersionIndex: applet?.publishedVersionIndex,
    };
}

export async function deleteAppletVersionSnapshots(versions = [], user = null) {
    const snapshotVersions = (Array.isArray(versions) ? versions : []).filter(
        (version) => version?.contentBlobPath || version?.contentHash,
    );
    if (snapshotVersions.length === 0) {
        return [];
    }

    return Promise.allSettled(
        snapshotVersions.map((version) =>
            deleteMediaFile({
                blobPath: version.contentBlobPath || null,
                hash: version.contentHash || null,
                fallbackToHash: !version.contentBlobPath,
                storageTarget: createAppletGlobalStorageTarget(
                    version.contentContextId || user?.contextId || null,
                ),
            }),
        ),
    );
}
