import { authorizedMediaFetch } from "../../utils/cfh-client.mjs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth.js";
import config from "../../../../config/index.js";
import { resolveAuthorizedMediaRouting } from "../../utils/file-route-utils.js";
import { buildFileIdentifierAttempts } from "../../utils/media-service-utils.js";

/**
 * DELETE /api/files/delete
 * Delete a file from cloud storage using CFH (cortex-file-handler)
 *
 * Query parameters:
 * - blobPath: Blob path within the container (preferred identifier)
 * - hash: File hash to delete (fallback identifier)
 * - contextId: Optional context ID for file scoping (e.g., user.contextId)
 *              If not provided, defaults to user.contextId
 *
 * At least one of blobPath or hash must be provided.
 */
export async function DELETE(request) {
    try {
        // Get current user for authentication
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(request.url);
        const blobPath = searchParams.get("blobPath");
        const hash = searchParams.get("hash");
        const routingInput = {
            contextId: searchParams.get("contextId"),
            userId: searchParams.get("userId"),
            workspaceId: searchParams.get("workspaceId"),
            chatId: searchParams.get("chatId"),
            fileScope: searchParams.get("fileScope"),
        };

        if (!blobPath && !hash) {
            return NextResponse.json(
                {
                    error: "At least one of blobPath or hash parameter is required",
                },
                { status: 400 },
            );
        }

        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            console.error(
                "CORTEX_MEDIA_API_URL is not set or mediaHelperUrl is undefined.",
            );
            return NextResponse.json(
                {
                    error: "Media helper URL is not configured. Please set CORTEX_MEDIA_API_URL.",
                },
                { status: 500 },
            );
        }

        const { routingParams } = await resolveAuthorizedMediaRouting({
            user,
            action: "delete",
            routingInput,
        });

        // A supplied path is authoritative; never fall back to a hash on failure.
        let deleteResult = null;
        let failedResponse = null;
        for (const attempt of buildFileIdentifierAttempts({ blobPath, hash })) {
            const deleteUrl = new URL(mediaHelperUrl);
            if (attempt.blobPath) {
                deleteUrl.searchParams.set("blobPath", attempt.blobPath);
            } else if (attempt.hash) {
                deleteUrl.searchParams.set("hash", attempt.hash);
            }
            for (const [key, value] of Object.entries(routingParams)) {
                deleteUrl.searchParams.set(key, value);
            }

            const deleteResponse = await authorizedMediaFetch(
                deleteUrl.toString(),
                {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );

            if (deleteResponse.ok) {
                deleteResult = await deleteResponse.json();
                failedResponse = null;
                break;
            }

            failedResponse = {
                status: deleteResponse.status,
                statusText: deleteResponse.statusText,
                errorBody: await deleteResponse.text().catch(() => ""),
            };
        }

        if (failedResponse) {
            console.warn(
                `Failed to delete file: ${failedResponse.statusText}. Response: ${failedResponse.errorBody}`,
            );
            return NextResponse.json(
                {
                    error: `Failed to delete file: ${failedResponse.statusText}`,
                    details: failedResponse.errorBody,
                },
                { status: failedResponse.status },
            );
        }

        const fileIdentifier = blobPath || hash;
        console.log(`Successfully deleted file ${fileIdentifier}`);

        return NextResponse.json({
            success: true,
            message: `File ${fileIdentifier} deleted successfully`,
            deleted: deleteResult.deleted || deleteResult,
        });
    } catch (error) {
        if (error.status) {
            return NextResponse.json(
                { error: error.message },
                { status: error.status },
            );
        }
        console.error("Error deleting file:", error);
        return NextResponse.json(
            {
                error: "Internal server error while deleting file",
                details: error.message,
            },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";

// Bounded bulk deletion, with authorization applied to every file before any
// mutation. Files sharing a scope use one CFH scan and retain per-file outcomes.
export async function POST(request) {
    try {
        const user = await getCurrentUser();
        if (!user)
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        const { files } = await request.json();
        if (
            !Array.isArray(files) ||
            !files.length ||
            files.length > 500 ||
            files.some(
                (file) =>
                    !file ||
                    typeof file.blobPath !== "string" ||
                    !file.blobPath ||
                    file.blobPath.length > 1024,
            )
        ) {
            return NextResponse.json(
                { error: "Provide 1 to 500 file locations" },
                { status: 400 },
            );
        }
        const groups = new Map();
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            const { routingParams } = await resolveAuthorizedMediaRouting({
                user,
                action: "delete",
                routingInput: {
                    contextId: file.contextId,
                    userId: file.userId,
                    workspaceId: file.workspaceId,
                    chatId: file.chatId,
                    fileScope: file.fileScope,
                },
            });
            const key = JSON.stringify(routingParams);
            if (!groups.has(key)) groups.set(key, { routingParams, items: [] });
            groups.get(key).items.push({ blobPath: file.blobPath, index });
        }
        const results = files.map((file) => ({
            blobPath: file.blobPath,
            deleted: false,
            status: 500,
        }));
        for (const { routingParams, items } of groups.values()) {
            try {
                const url = new URL(config.endpoints.mediaHelperDirect());
                for (const [key, value] of Object.entries(routingParams))
                    url.searchParams.set(key, value);
                const response = await authorizedMediaFetch(url.toString(), {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        blobPaths: items.map((item) => item.blobPath),
                    }),
                });
                if (!response.ok) {
                    items.forEach((item) => {
                        results[item.index].status = response.status;
                    });
                    continue;
                }
                const data = await response.json();
                const byPath = new Map(
                    (data.results || []).map((result) => [
                        result.blobPath,
                        result,
                    ]),
                );
                items.forEach((item) => {
                    const result = byPath.get(item.blobPath);
                    if (result)
                        results[item.index] = {
                            blobPath: item.blobPath,
                            deleted: result.deleted === true,
                            status: result.status,
                        };
                });
            } catch {
                /* Keep unconfirmed outcomes failed and retryable. */
            }
        }
        return NextResponse.json({ results });
    } catch (error) {
        return NextResponse.json(
            { error: "Unable to delete files" },
            { status: error.status || 500 },
        );
    }
}
