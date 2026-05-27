import { getFilename as getFilenameFromUtils } from "@/src/utils/fileDownloadUtils";

const fileIdMap = new WeakMap();
let fileIdCounter = 0;

export function createFileId(file) {
    if (typeof file === "object" && file !== null) {
        if (file.blobPath) return `bp-${file.blobPath}`;
        if (file._id) return `id-${file._id}`;
        if (file.hash) return `hash-${file.hash}`;
        if (file.id) return `id-${file.id}`;
        if (file.url) return `url-${file.url}`;

        const existingId = fileIdMap.get(file);
        if (existingId) return existingId;

        const filename = getFilenameFromUtils(file) || "Unnamed file";
        const size = file.size ?? file.bytes ?? "unknown";
        const newId = `file-${filename}-${size}-${++fileIdCounter}`;
        fileIdMap.set(file, newId);
        return newId;
    }

    return `file-${getFilenameFromUtils(file) || "Unnamed file"}`;
}
