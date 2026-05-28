import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { parseStreamingMultipart } from "../../../utils/upload-utils";
import {
    deleteMediaFile,
    listAutomationFiles,
    uploadBufferToMediaService,
} from "../../../utils/media-service-utils";
import { createAutomationStorageTarget } from "../../../../../src/utils/storageTargets";
import {
    AUTOMATION_MD,
    findAutomationForUser,
    sanitizeAutomationFilename,
} from "../../utils";

export async function GET(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const automation = await findAutomationForUser(params.id, user._id);

        if (!automation) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const files = await listAutomationFiles(
            user.contextId,
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
        const automation = await findAutomationForUser(params.id, user._id);

        if (!automation) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const result = await parseStreamingMultipart(request, user);
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
        const storageTarget = createAutomationStorageTarget(user.contextId);
        const uploadResult = await uploadBufferToMediaService(
            fileBuffer,
            metadata,
            { storageTarget, subPath: automation.slug },
        );

        if (uploadResult.error) {
            return uploadResult.error;
        }

        const files = await listAutomationFiles(
            user.contextId,
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
        const automation = await findAutomationForUser(params.id, user._id);

        if (!automation) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
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

        const storageTarget = createAutomationStorageTarget(user.contextId);
        await deleteMediaFile({
            blobPath: `automations/${automation.slug}/${safeName}`,
            storageTarget,
        });

        const files = await listAutomationFiles(
            user.contextId,
            automation.slug,
        );
        return NextResponse.json({ success: true, files });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
