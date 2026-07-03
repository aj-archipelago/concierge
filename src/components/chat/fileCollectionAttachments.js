import { getFilename } from "../../utils/mediaUtils";

export const CHAT_FILE_ATTACH_EVENT = "concierge:chat-files-attach";

export function buildFileCollectionAttachment(file, index, timestamp) {
    const displayFilename =
        file.displayName ||
        file.displayFilename ||
        file.filename ||
        file.name ||
        getFilename(file.url || "");
    const id = `cfh-${file.blobPath || file.url || index}-${timestamp}`;
    const mimeType = file.mimeType || file.type || "";
    const urlData = {
        url: file.url,
        displayFilename,
        hash: file.hash,
        blobPath: file.blobPath,
        converted: file.converted,
        mimeType,
    };

    return {
        urlData,
        file: {
            id,
            source: { url: file.url, ...file },
            filename: displayFilename,
            name: displayFilename,
            type: mimeType,
            size: file.size || 0,
            status: "completed",
            progress: 100,
            serverId: file.url,
        },
    };
}

export function buildFileCollectionAttachments(selectedObjects) {
    const timestamp = Date.now();
    return (selectedObjects || []).map((file, index) =>
        buildFileCollectionAttachment(file, index, timestamp),
    );
}

export function dispatchChatFileAttach({ chatId, files }) {
    if (typeof window === "undefined" || !chatId || !files?.length) return;

    window.dispatchEvent(
        new CustomEvent(CHAT_FILE_ATTACH_EVENT, {
            detail: {
                chatId: String(chatId),
                files,
            },
        }),
    );
}
