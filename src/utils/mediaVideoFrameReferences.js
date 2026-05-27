export const VIDEO_FRAME_REFERENCE_ROLES = ["start_frame", "end_frame"];

function normalizeBlobPath(value) {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
}

function stripMediaPrefix(blobPath) {
    return blobPath.replace(/^media\//, "");
}

function stripExtension(filename) {
    return filename.replace(/\.[^.]*$/, "");
}

export function getVideoFrameReferenceTarget(sourceBlobPath, role) {
    if (!VIDEO_FRAME_REFERENCE_ROLES.includes(role)) return null;

    const normalizedSourcePath = normalizeBlobPath(sourceBlobPath);
    if (!normalizedSourcePath) return null;

    const relativeSourcePath = stripMediaPrefix(normalizedSourcePath);
    const segments = relativeSourcePath.split("/").filter(Boolean);
    const sourceFilename = segments.pop();
    if (!sourceFilename) return null;

    const sourceDirectory = segments.join("/");
    const sourceBaseName = stripExtension(sourceFilename) || sourceFilename;
    const filename = `${sourceBaseName}.${role}.jpg`;
    const subPath = normalizeBlobPath(
        ["video-frame-references", sourceDirectory].filter(Boolean).join("/"),
    );
    const blobPath = normalizeBlobPath(["media", subPath, filename].join("/"));

    return {
        blobPath,
        filename,
        subPath,
    };
}

export function getVideoFrameReferenceTargets(sourceBlobPath) {
    return VIDEO_FRAME_REFERENCE_ROLES.map((role) =>
        getVideoFrameReferenceTarget(sourceBlobPath, role),
    ).filter(Boolean);
}
