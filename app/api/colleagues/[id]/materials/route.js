import { getCurrentUser } from "../../../utils/auth";
import {
    colleagueRequest,
    requireColleague,
} from "../../../utils/colleagues.js";
import { parseStreamingMultipart } from "../../../utils/upload-utils";
import { FILE_VALIDATION_CONFIG } from "../../../utils/fileValidation";
import {
    uploadBufferToMediaService,
    listMediaFiles,
    deleteMediaFile,
    hashBuffer,
} from "../../../utils/media-service-utils";
import { createAppletSharedStorageTarget } from "../../../../../src/utils/storageTargets";

// Authored source files are stored as reference data, never executed on upload.
const REFERENCE_EXTENSIONS = [
    ".md",
    ".markdown",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".csv",
    ".tsv",
    ".xml",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".py",
    ".sh",
    ".sql",
    ".css",
    ".html",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
];
const MATERIAL_VALIDATION = {
    MAX_FILE_SIZE: 32 * 1024 * 1024,
    ALLOWED_EXTENSIONS: REFERENCE_EXTENSIONS,
    BLOCKED_EXTENSIONS: FILE_VALIDATION_CONFIG.BLOCKED_EXTENSIONS.filter(
        (extension) => !REFERENCE_EXTENSIONS.includes(extension),
    ),
};

function materialPath(value) {
    if (
        typeof value !== "string" ||
        !value ||
        value.length > 512 ||
        [...value].some((char) => char === "\\" || char.charCodeAt(0) < 32) ||
        value.startsWith("/") ||
        value.split("/").some((p) => !p || p === "." || p === "..")
    )
        throw new Error("Invalid material path");
    return value;
}
async function access(params, edit = false) {
    const user = await getCurrentUser();
    if (!user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    const { id } = await params;
    const assistant = await requireColleague(user, id);
    if (!assistant.materialsContext)
        throw new Error("This assistant does not support attached materials");
    if (edit && !assistant.editable)
        throw Object.assign(new Error("Only authors can edit materials"), {
            status: 403,
        });
    return {
        user,
        assistant,
        storageTarget: createAppletSharedStorageTarget(
            assistant.materialsContext.split(":")[1],
        ),
    };
}
const failure = (error) =>
    Response.json({ error: error.message }, { status: error.status || 400 });
function publicFiles(files) {
    return files.map((file) => ({
        path: String(file.blobPath || file.name || "").replace(
            /^applet-shared\//,
            "",
        ),
        size: file.size || file.fileSize || null,
    }));
}
export async function GET(_request, { params }) {
    try {
        const { storageTarget, assistant } = await access(params);
        return Response.json(
            {
                files: publicFiles(
                    await listMediaFiles({ storageTarget, throwOnError: true }),
                ),
                canEdit: assistant.editable,
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request, { params }) {
    try {
        const { user, assistant, storageTarget } = await access(params, true);
        const path = materialPath(
            new URL(request.url).searchParams.get("path"),
        );
        const parsed = await parseStreamingMultipart(request, user, {
            validationConfig: MATERIAL_VALIDATION,
        });
        if (parsed.error) return parsed.error;
        const { fileBuffer, metadata } = parsed.data;
        if (fileBuffer.length > 32 * 1024 * 1024)
            throw new Error("Materials must be at most 32 MB per file");
        if (path.endsWith("/SKILL.md") && fileBuffer.length > 100000)
            throw new Error("SKILL.md must be at most 100 KB");
        // Enable the reference scope first; an empty scope after a failed upload is safe.
        await colleagueRequest("manage", {
            userId: user.contextId,
            action: "update",
            entityId: assistant.id,
            settings: JSON.stringify({ materialsEnabled: true }),
        });
        const parts = path.split("/");
        const result = await uploadBufferToMediaService(
            fileBuffer,
            {
                ...metadata,
                filename: parts.pop(),
                hash: await hashBuffer(fileBuffer),
            },
            { storageTarget, subPath: parts.join("/") || null },
        );
        if (result.error) throw new Error("Material upload failed");
        return Response.json({ success: true, path });
    } catch (error) {
        return failure(error);
    }
}
export async function DELETE(request, { params }) {
    try {
        const { storageTarget } = await access(params, true);
        const path = materialPath(
            new URL(request.url).searchParams.get("path"),
        );
        const result = await deleteMediaFile({
            storageTarget,
            blobPath: `applet-shared/${path}`,
        });
        if (!result || result.error || result.success === false)
            throw new Error("Material deletion failed");
        return Response.json({ success: true });
    } catch (error) {
        return failure(error);
    }
}
