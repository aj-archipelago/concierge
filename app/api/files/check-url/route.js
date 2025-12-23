import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth.js";

/**
 * Redact sensitive query parameters from URL for logging
 */
function redactUrl(url) {
    try {
        const parsed = new URL(url);
        // Redact common sensitive params (SAS tokens, API keys, etc.)
        const sensitiveParams = ["sig", "sv", "se", "st", "sp", "sr", "spr"];
        sensitiveParams.forEach((param) => {
            if (parsed.searchParams.has(param)) {
                parsed.searchParams.set(param, "[REDACTED]");
            }
        });
        return parsed.toString();
    } catch {
        return "[INVALID_URL]";
    }
}

/**
 * POST /api/files/check-url
 * Check if a file URL exists by making a server-side request
 * This avoids CORS issues and doesn't rely on hash database
 * Uses POST to avoid logging sensitive URLs in server logs
 *
 * Body:
 * - url: File URL to check (required)
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
        const fileUrl = body?.url;

        if (!fileUrl) {
            return NextResponse.json(
                { error: "URL parameter is required" },
                { status: 400 },
            );
        }

        // Validate URL format
        let url;
        try {
            url = new URL(fileUrl);
        } catch (error) {
            return NextResponse.json(
                { error: "Invalid URL format" },
                { status: 400 },
            );
        }

        // Check if file exists by making a HEAD request
        // If HEAD fails, try GET with range request (more efficient than full download)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        try {
            // Try HEAD first (most efficient)
            const headResponse = await fetch(url.toString(), {
                method: "HEAD",
                redirect: "follow",
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (headResponse.ok) {
                return NextResponse.json({ exists: true });
            }

            // If HEAD returns 404, file doesn't exist
            if (headResponse.status === 404) {
                return NextResponse.json({ exists: false });
            }

            // If HEAD fails for other reasons, try GET with range request
            const getController = new AbortController();
            const getTimeoutId = setTimeout(() => getController.abort(), 5000);

            try {
                const getResponse = await fetch(url.toString(), {
                    method: "GET",
                    headers: {
                        // Request only first byte to check existence
                        // Note: Some servers may ignore Range header and return full file (200 OK)
                        // instead of partial content (206). The 5-second timeout limits impact.
                        Range: "bytes=0-0",
                    },
                    redirect: "follow",
                    signal: getController.signal,
                });

                clearTimeout(getTimeoutId);

                if (getResponse.ok || getResponse.status === 206) {
                    // 206 is Partial Content, which means file exists
                    return NextResponse.json({ exists: true });
                }

                if (getResponse.status === 404) {
                    return NextResponse.json({ exists: false });
                }

                // For other status codes, assume file doesn't exist to be safe
                return NextResponse.json({ exists: false });
            } catch (getError) {
                clearTimeout(getTimeoutId);
                throw getError;
            }
        } catch (error) {
            clearTimeout(timeoutId);
            // Network errors, timeouts, etc. - assume file doesn't exist
            if (error.name === "AbortError") {
                console.warn(
                    `Timeout checking file URL: ${redactUrl(fileUrl)}`,
                );
            } else {
                console.warn(
                    `Error checking file URL ${redactUrl(fileUrl)}:`,
                    error.message,
                );
            }
            return NextResponse.json({ exists: false });
        }
    } catch (error) {
        console.error("Error in check-url endpoint:", error);
        return NextResponse.json(
            {
                error: "Internal server error while checking file URL",
                details: error.message,
            },
            { status: 500 },
        );
    }
}
