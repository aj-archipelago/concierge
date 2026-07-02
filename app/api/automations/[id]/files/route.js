import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { parseStreamingMultipart } from "../../../utils/upload-utils";
import { FILE_VALIDATION_CONFIG } from "../../../utils/fileValidation";
import {
    deleteMediaFile,
    uploadBufferToMediaService,
} from "../../../utils/media-service-utils";
import { createAutomationStorageTarget } from "../../../../../src/utils/storageTargets";
import {
    AUTOMATION_MD,
    findAutomationForEditor,
    findAutomationForViewer,
    listAutomationSupportingFiles,
    resolveAutomationStorageContextId,
    sanitizeAutomationFilename,
} from "../../utils";

const AUTOMATION_REFERENCE_FILE_EXTENSIONS = [
    ".pdf",
    ".txt",
    ".csv",
    ".tsv",
    ".json",
    ".md",
    ".xml",
    ".yaml",
    ".yml",
    ".js",
    ".mjs",
    ".ts",
    ".py",
    ".html",
    ".css",
    ".doc",
    ".docx",
    ".xlsx",
    ".xls",
    ".ppt",
    ".pptx",
    ".pptm",
    ".heic",
    ".heif",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tiff",
    ".mp4",
    ".mpeg",
    ".mov",
    ".avi",
    ".flv",
    ".mpg",
    ".webm",
    ".wmv",
    ".3gp",
    ".wav",
    ".mp3",
    ".m4a",
    ".aac",
    ".ogg",
    ".flac",
];

const AUTOMATION_UPLOAD_VALIDATION_CONFIG = {
    ...FILE_VALIDATION_CONFIG,
    MAX_FILE_SIZE: Math.max(
        FILE_VALIDATION_CONFIG.MAX_FILE_SIZE,
        50 * 1024 * 1024,
    ),
    ALLOWED_EXTENSIONS: AUTOMATION_REFERENCE_FILE_EXTENSIONS,
    BLOCKED_EXTENSIONS: FILE_VALIDATION_CONFIG.BLOCKED_EXTENSIONS.filter(
        (extension) =>
            !AUTOMATION_REFERENCE_FILE_EXTENSIONS.includes(extension),
    ),
};

export async function GET(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const found = await findAutomationForViewer(params.id, user._id);

        if (!found) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const { automation, isOwner } = found;
        const storageContextId = await resolveAutomationStorageContextId(
            automation,
            user,
            isOwner,
        );
        if (!storageContextId) {
            return NextResponse.json({ files: [] });
        }

        const files = await listAutomationSupportingFiles(
            storageContextId,
            automation.slug,
        );
        return NextResponse.json({ files });
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const found = await findAutomationForEditor(params.id, user._id);

        if (!found) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const { automation, isOwner } = found;
        const storageContextId = await resolveAutomationStorageContextId(
            automation,
            user,
            isOwner,
        );
        if (!storageContextId) {
            return NextResponse.json(
                { error: "Automation storage is unavailable" },
                { status: 500 },
            );
        }

        const result = await parseStreamingMultipart(request, user, {
            validationConfig: AUTOMATION_UPLOAD_VALIDATION_CONFIG,
        });
        if (result.error) {
            return result.error;
        }

        const { fileBuffer, metadata } = result.data;
        const safeName = sanitizeAutomationFilename(metadata.filename);
        if (!safeName) {
            return NextResponse.json(
                { error: "Invalid filename" },
                { status: 400 },
            );
        }
        if (safeName.toLowerCase() === AUTOMATION_MD.toLowerCase()) {
            return NextResponse.json(
                {
                    error: `Cannot upload a file named ${AUTOMATION_MD}. Use the automation editor instead.`,
                },
                { status: 400 },
            );
        }

        metadata.filename = safeName;
        const storageTarget = createAutomationStorageTarget(storageContextId);
        const uploadResult = await uploadBufferToMediaService(
            fileBuffer,
            metadata,
            { storageTarget, subPath: automation.slug },
        );

        if (uploadResult.error) {
            return uploadResult.error;
        }

        const files = await listAutomationSupportingFiles(
            storageContextId,
            automation.slug,
        );
        return NextResponse.json({ success: true, files });
    } catch (error) {
        return handleError(error);
    }
}

export async function DELETE(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const found = await findAutomationForEditor(params.id, user._id);

        if (!found) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const { automation, isOwner } = found;
        const storageContextId = await resolveAutomationStorageContextId(
            automation,
            user,
            isOwner,
        );
        if (!storageContextId) {
            return NextResponse.json(
                { error: "Automation storage is unavailable" },
                { status: 500 },
            );
        }

        const { searchParams } = new URL(request.url);
        const safeName = sanitizeAutomationFilename(
            searchParams.get("filename"),
        );
        if (!safeName) {
            return NextResponse.json(
                { error: "Filename is required" },
                { status: 400 },
            );
        }
        if (safeName.toLowerCase() === AUTOMATION_MD.toLowerCase()) {
            return NextResponse.json(
                {
                    error: `Cannot delete ${AUTOMATION_MD}. Delete the automation instead.`,
                },
                { status: 400 },
            );
        }

        const storageTarget = createAutomationStorageTarget(storageContextId);
        await deleteMediaFile({
            blobPath: `automations/${automation.slug}/${safeName}`,
            storageTarget,
        });

        const files = await listAutomationSupportingFiles(
            storageContextId,
            automation.slug,
        );
        return NextResponse.json({ success: true, files });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
