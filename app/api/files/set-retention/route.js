import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth.js";
import config from "../../../../config/index.js";

/**
 * POST /api/files/set-retention
 * Set the retention tag for a file (temporary or permanent)
 *
 * Body parameters:
 * - hash: File hash (required)
 * - retention: 'temporary' or 'permanent' (required)
 */
export async function POST(request) {
    try {
        // Get current user for authentication
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { hash, retention } = body;

        if (!hash) {
            return NextResponse.json(
                { error: "Hash parameter is required" },
                { status: 400 },
            );
        }

        if (!retention || !["temporary", "permanent"].includes(retention)) {
            return NextResponse.json(
                {
                    error: "Retention parameter is required and must be 'temporary' or 'permanent'",
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

        // Call CFH setRetention API
        // According to CFH INTERFACE.md: POST/PUT with hash and retention parameters
        const setRetentionUrl = new URL(mediaHelperUrl);
        setRetentionUrl.searchParams.set("hash", hash);
        setRetentionUrl.searchParams.set("retention", retention);
        setRetentionUrl.searchParams.set("setRetention", "true");
        setRetentionUrl.searchParams.set("contextId", user.contextId);

        const setRetentionResponse = await fetch(setRetentionUrl.toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!setRetentionResponse.ok) {
            const errorBody = await setRetentionResponse.text();
            console.warn(
                `Failed to set retention for file: ${setRetentionResponse.statusText}. Response: ${errorBody}`,
            );
            return NextResponse.json(
                {
                    error: `Failed to set retention: ${setRetentionResponse.statusText}`,
                    details: errorBody,
                },
                { status: setRetentionResponse.status },
            );
        }

        const result = await setRetentionResponse.json();
        console.log(
            `Successfully set retention to ${retention} for file ${hash}`,
        );

        return NextResponse.json({
            success: true,
            message: `File retention set to ${retention}`,
            result,
        });
    } catch (error) {
        console.error("Error setting file retention:", error);
        return NextResponse.json(
            {
                error: "Internal server error while setting file retention",
                details: error.message,
            },
            { status: 500 },
        );
    }
}
