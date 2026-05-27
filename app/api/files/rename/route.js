import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth.js";
import config from "../../../../config/index.js";
import { INVALID_FILENAME_CHARS } from "../../utils/llm-file-utils.js";
import { resolveAuthorizedMediaRouting } from "../../utils/file-route-utils.js";
import { buildFileIdentifierAttempts } from "../../utils/media-service-utils.js";

/**
 * POST /api/files/rename
 * Rename a file in cloud storage (copy to new name, delete old blob, update Redis entry).
 *
 * Body parameters:
 * - blobPath: Blob path within the container (preferred identifier)
 * - hash: File hash (fallback identifier)
 * - newFilename: New filename (required)
 * - targetBlobPath: Optional full target blob path for folder moves
 * - userId: User ID for file scoping (optional, falls back to user.contextId)
 *
 * At least one of blobPath or hash must be provided.
 */
export async function POST(request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const {
            blobPath,
            hash,
            newFilename,
            targetBlobPath,
            contextId,
            userId,
            workspaceId,
            chatId,
            fileScope,
        } = body;

        if (!blobPath && !hash) {
            return NextResponse.json(
                {
                    error: "At least one of blobPath or hash parameter is required",
                },
                { status: 400 },
            );
        }

        if (targetBlobPath && !blobPath) {
            return NextResponse.json(
                { error: "blobPath is required for folder moves" },
                { status: 400 },
            );
        }

        if (!newFilename || !newFilename.trim()) {
            return NextResponse.json(
                { error: "newFilename parameter is required" },
                { status: 400 },
            );
        }

        INVALID_FILENAME_CHARS.lastIndex = 0;
        if (INVALID_FILENAME_CHARS.test(newFilename)) {
            return NextResponse.json(
                { error: "Filename contains invalid characters" },
                { status: 400 },
            );
        }
        INVALID_FILENAME_CHARS.lastIndex = 0;
        if (targetBlobPath && INVALID_FILENAME_CHARS.test(targetBlobPath)) {
            return NextResponse.json(
                { error: "Target path contains invalid characters" },
                { status: 400 },
            );
        }

        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            return NextResponse.json(
                { error: "Media helper URL is not configured" },
                { status: 500 },
            );
        }
        const { routingParams } = await resolveAuthorizedMediaRouting({
            user,
            routingInput: {
                contextId,
                userId,
                workspaceId,
                chatId,
                fileScope,
            },
        });

        // Call CFH rename API — prefer blobPath and only fall back to hash on miss
        let result = null;
        let failedResponse = null;

        for (const attempt of buildFileIdentifierAttempts({
            blobPath,
            hash,
            fallbackToHash: !targetBlobPath,
        })) {
            const renameUrl = new URL(mediaHelperUrl);
            if (attempt.blobPath) {
                renameUrl.searchParams.set("blobPath", attempt.blobPath);
            } else if (attempt.hash) {
                renameUrl.searchParams.set("hash", attempt.hash);
            }
            renameUrl.searchParams.set("rename", "true");
            renameUrl.searchParams.set("newFilename", newFilename.trim());
            if (targetBlobPath?.trim()) {
                renameUrl.searchParams.set(
                    "targetBlobPath",
                    targetBlobPath.trim(),
                );
            }
            for (const [key, value] of Object.entries(routingParams)) {
                renameUrl.searchParams.set(key, value);
            }

            const renameResponse = await fetch(renameUrl.toString(), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (renameResponse.ok) {
                result = await renameResponse.json();
                failedResponse = null;
                break;
            }

            failedResponse = {
                status: renameResponse.status,
                statusText: renameResponse.statusText,
                errorBody: await renameResponse.text().catch(() => ""),
            };
        }

        if (failedResponse) {
            return NextResponse.json(
                {
                    error: `Failed to rename file: ${failedResponse.statusText}`,
                    details: failedResponse.errorBody,
                },
                { status: failedResponse.status },
            );
        }

        return NextResponse.json({
            success: true,
            message: `File renamed to ${newFilename}`,
            result,
        });
    } catch (error) {
        if (error.status) {
            return NextResponse.json(
                { error: error.message },
                { status: error.status },
            );
        }
        console.error("Error renaming file:", error);
        return NextResponse.json(
            {
                error: "Internal server error while renaming file",
                details: error.message,
            },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
