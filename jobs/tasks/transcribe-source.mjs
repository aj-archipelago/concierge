import { checkMediaFile } from "../../app/api/utils/media-service-utils.js";
import {
    createUserGlobalStorageTarget,
    createMediaStorageTarget,
    createChatStorageTarget,
    createAppletUserStorageTarget,
} from "../../src/utils/storageTargets.js";
import { getStoredTranscriptionSource } from "../../src/utils/transcriptionSource.js";

async function resolveStorageTarget(
    source,
    contextId,
    { userId, sourceFile } = {},
) {
    const [scope, id] = source.blobPath.split("/");
    if (scope === "global") return createUserGlobalStorageTarget(contextId);
    if (scope === "media") return createMediaStorageTarget(contextId);
    if (!userId || !/^[a-f0-9]{24}$/i.test(id || "")) {
        throw new Error("Unable to authorize this saved media file");
    }
    if (scope === "chats") {
        const { default: Chat } = await import("../../app/api/models/chat.mjs");
        if (await Chat.exists({ _id: id, userId })) {
            return createChatStorageTarget(contextId, id);
        }
    }
    if (scope === "applets") {
        const { default: AppletFile } = await import(
            "../../app/api/models/applet-file.js"
        );
        const { validateAppletAccess } = await import(
            "../../app/api/applet/access.js"
        );
        if (sourceFile && (sourceFile.appletId !== id || !sourceFile.fileId)) {
            throw new Error("Saved media source does not match its applet");
        }
        const denied = await validateAppletAccess(id, {
            _id: userId,
            contextId,
        });
        if (!denied) {
            // Older queued tasks have only a URL. Reconstruct authority from
            // current owner/file membership, never from a submitted scope.
            const store = await AppletFile.findOne({
                appletId: id,
                userId,
            }).populate("files");
            const file = store?.files?.find(
                (candidate) =>
                    String(candidate.owner) === String(userId) &&
                    (!sourceFile ||
                        String(candidate._id) === sourceFile.fileId) &&
                    getStoredTranscriptionSource(candidate.url)?.identity ===
                        source.identity,
            );
            if (file) return createAppletUserStorageTarget(contextId, id);
        }
    }
    throw new Error("Unable to authorize this saved media file");
}

export async function refreshTranscriptionSource(
    url,
    contextId,
    authorization = {},
) {
    const source = getStoredTranscriptionSource(url);
    if (!source) return url;
    // CFH currently resolves current blobs, not immutable versions. Never
    // silently substitute today's file for a requested snapshot/version.
    if (!contextId || source.versioned) {
        throw new Error("Unable to renew access to this saved media file");
    }
    const file = await checkMediaFile({
        blobPath: source.blobPath,
        storageTarget: await resolveStorageTarget(
            source,
            contextId,
            authorization,
        ),
        signal: AbortSignal.timeout(15000),
    });
    const accessUrl = file?.shortLivedUrl || file?.url;
    if (
        !accessUrl ||
        getStoredTranscriptionSource(accessUrl)?.identity !== source.identity
    ) {
        throw new Error(
            "Unable to access saved media. The file may have been removed or your access may have changed.",
        );
    }
    return accessUrl;
}
