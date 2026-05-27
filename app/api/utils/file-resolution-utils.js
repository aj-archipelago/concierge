import { resolveStorageTarget } from "../../../src/utils/storageTargets.js";
import {
    checkMediaFile,
    hashBuffer,
    uploadBufferToMediaService,
} from "./media-service-utils.js";

function toPlainFile(file) {
    if (!file) return null;
    if (typeof file.toObject === "function") {
        return file.toObject();
    }
    return { ...file };
}

function extractBlobPathFromUrl(blobUrl) {
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

function extractHashFromBlobUrl(blobUrl) {
    try {
        const urlObj = new URL(blobUrl);
        const lastSegment = urlObj.pathname.split("/").pop();
        if (!lastSegment) return null;
        const decoded = decodeURIComponent(lastSegment);
        const idx = decoded.indexOf("_");
        if (idx > 0) {
            const prefix = decoded.substring(0, idx);
            if (/^[0-9a-f]+$/i.test(prefix)) {
                return prefix;
            }
        }
    } catch {
        // ignore
    }
    return null;
}

function mergeResolvedFile(baseFile, resolvedData, fallback = {}) {
    const hasResolvedData = !!resolvedData;
    const merged = {
        ...baseFile,
        ...(resolvedData || {}),
        ...fallback,
        url: resolvedData?.url || fallback.url || baseFile?.url || null,
        gcsUrl: hasResolvedData
            ? resolvedData?.gcs || fallback.gcsUrl || null
            : fallback.gcsUrl || baseFile?.gcsUrl || null,
        hash: resolvedData?.hash || fallback.hash || baseFile?.hash || null,
        blobPath:
            resolvedData?.blobPath ||
            fallback.blobPath ||
            baseFile?.blobPath ||
            null,
    };

    if (resolvedData?.converted || baseFile?.converted) {
        merged.converted = {
            ...(baseFile?.converted || {}),
            ...(resolvedData?.converted || {}),
        };
    }

    return merged;
}

function buildPersistenceUpdate(mergedFile) {
    const update = {
        url: mergedFile.url,
        $unset: { error: "" },
    };

    if (mergedFile.hash) {
        update.hash = mergedFile.hash;
    }
    if (mergedFile.gcsUrl) {
        update.gcsUrl = mergedFile.gcsUrl;
    } else {
        update.$unset.gcsUrl = "";
    }
    if (mergedFile.blobPath) {
        update.blobPath = mergedFile.blobPath;
    }

    return update;
}

async function resolveFromMediaService(file, storageTarget) {
    const blobPath = file?.blobPath || extractBlobPathFromUrl(file?.url);
    const hash = file?.hash || extractHashFromBlobUrl(file?.url);

    if (!blobPath && !hash) {
        return null;
    }

    const resolved = await checkMediaFile({
        blobPath,
        hash,
        storageTarget,
    });

    if (!resolved) {
        return null;
    }

    return mergeResolvedFile(file, resolved, {
        blobPath,
        hash,
    });
}

async function refreshFromStoredUrl(file, storageTarget) {
    if (!file?.url) {
        return null;
    }

    const response = await fetch(file.url, {
        redirect: "follow",
    });
    if (!response.ok) {
        return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const hash = file.hash || (await hashBuffer(fileBuffer));

    const existingFile = await checkMediaFile({
        hash,
        storageTarget,
    });
    if (existingFile) {
        return mergeResolvedFile(file, existingFile, { hash });
    }

    const contentType =
        file.mimeType ||
        response.headers.get("content-type") ||
        "application/octet-stream";
    const filename = file.originalName || file.filename || "file";

    const uploadResult = await uploadBufferToMediaService(
        fileBuffer,
        {
            filename,
            mimeType: contentType,
            size: file.size || fileBuffer.length,
            hash,
        },
        {
            storageTarget,
        },
    );

    if (uploadResult?.error || !uploadResult?.data) {
        return null;
    }

    const uploadedFile = mergeResolvedFile(file, uploadResult.data, { hash });
    const refreshedFile = await checkMediaFile({
        blobPath: uploadedFile.blobPath,
        hash: uploadedFile.hash,
        storageTarget,
    });

    return refreshedFile
        ? mergeResolvedFile(uploadedFile, refreshedFile)
        : uploadedFile;
}

function toStorageTargetKey(storageTarget) {
    const resolved = resolveStorageTarget({ storageTarget });
    return [
        resolved.kind,
        resolved.userContextId || "",
        resolved.workspaceId || "",
        resolved.appletId || "",
        resolved.chatId || "",
    ].join("|");
}

function normalizeFallbackStorageTargets(
    storageTarget,
    fallbackStorageTargets = [],
) {
    const primaryTarget = resolveStorageTarget({ storageTarget });
    const primaryKey = toStorageTargetKey(primaryTarget);
    const seen = new Set([primaryKey]);
    const normalizedTargets = [];

    const fallbackTargets = Array.isArray(fallbackStorageTargets)
        ? fallbackStorageTargets
        : [fallbackStorageTargets];

    for (const fallbackStorageTarget of fallbackTargets) {
        if (!fallbackStorageTarget) {
            continue;
        }

        const resolvedTarget = resolveStorageTarget({
            storageTarget: fallbackStorageTarget,
        });
        const resolvedKey = toStorageTargetKey(resolvedTarget);

        if (seen.has(resolvedKey)) {
            continue;
        }

        seen.add(resolvedKey);
        normalizedTargets.push(resolvedTarget);
    }

    return normalizedTargets;
}

async function resolveFromFallbackTargets(file, fallbackStorageTargets = []) {
    for (const fallbackStorageTarget of fallbackStorageTargets) {
        const resolvedFile = await resolveFromMediaService(
            file,
            fallbackStorageTarget,
        );
        if (resolvedFile) {
            return {
                file: resolvedFile,
                storageTarget: fallbackStorageTarget,
            };
        }
    }

    return null;
}

export async function resolveAndHealFile(
    file,
    {
        storageTarget,
        fallbackStorageTargets = [],
        persistResolvedFile = null,
        allowUrlRefresh = false,
    } = {},
) {
    const plainFile = toPlainFile(file);
    if (!plainFile || !storageTarget) {
        return {
            file: plainFile,
            accessUrl: plainFile?.url || null,
            status: "unresolved",
        };
    }

    const primaryStorageTarget = resolveStorageTarget({ storageTarget });
    const normalizedFallbackStorageTargets = normalizeFallbackStorageTargets(
        primaryStorageTarget,
        fallbackStorageTargets,
    );

    let resolvedFile = await resolveFromMediaService(
        plainFile,
        primaryStorageTarget,
    );
    let status = "resolved";

    if (!resolvedFile) {
        const fallbackResolution = await resolveFromFallbackTargets(
            plainFile,
            normalizedFallbackStorageTargets,
        );

        if (fallbackResolution) {
            resolvedFile = fallbackResolution.file;

            if (allowUrlRefresh) {
                const refreshedFile = await refreshFromStoredUrl(
                    fallbackResolution.file,
                    primaryStorageTarget,
                );

                if (refreshedFile) {
                    resolvedFile = refreshedFile;
                    status = "refreshed";
                }
            }
        } else if (allowUrlRefresh) {
            resolvedFile = await refreshFromStoredUrl(
                plainFile,
                primaryStorageTarget,
            );
            status = resolvedFile ? "refreshed" : "unresolved";
        } else {
            status = "unresolved";
        }
    }

    const finalFile = resolvedFile || plainFile;

    if (resolvedFile && typeof persistResolvedFile === "function") {
        await persistResolvedFile(buildPersistenceUpdate(finalFile), finalFile);
    }

    return {
        file: finalFile,
        accessUrl:
            finalFile?.shortLivedUrl ||
            finalFile?.url ||
            plainFile?.url ||
            null,
        status,
    };
}
