import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const SLACK_AUTH_URL = "https://slack.com/oauth/v2/authorize";

const BOT_SCOPES = [
    "chat:write",
    "im:write",
    "mpim:write",
    "users:read",
    "users:read.email",
].join(",");

// mcp.slack.com only accepts user tokens, so reads must go through user_scope.
const USER_SCOPES = [
    // Search
    "search:read",
    // Message history
    "channels:history",
    "groups:history",
    "im:history",
    "mpim:history",
    // Channels & users
    "channels:read",
    "groups:read",
    "users:read",
    "users:read.email",
].join(",");

export async function GET(request) {
    try {
        const user = await getCurrentUser(false);
        if (!user?._id) {
            return NextResponse.redirect(
                new URL("/auth/error?error=unauthorized", getBaseUrl(request)),
            );
        }

        const clientId = process.env.SLACK_CLIENT_ID;
        if (!clientId) {
            console.error("SLACK_CLIENT_ID is not configured");
            return NextResponse.redirect(
                new URL(
                    "/auth/error?error=slack_not_configured",
                    getBaseUrl(request),
                ),
            );
        }

        const state = crypto.randomBytes(24).toString("hex");
        const redirectUri = `${getBaseUrl(request)}/api/auth/slack/callback`;

        const params = new URLSearchParams({
            client_id: clientId,
            scope: BOT_SCOPES,
            user_scope: USER_SCOPES,
            redirect_uri: redirectUri,
            state,
        });

        const authUrl = `${SLACK_AUTH_URL}?${params.toString()}`;

        const response = NextResponse.redirect(authUrl);
        response.cookies.set("slack_oauth_state", state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 600,
            path: "/",
        });
        response.cookies.set("slack_oauth_user_id", String(user._id), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 600,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Slack OAuth init error:", error);
        return NextResponse.redirect(
            new URL("/auth/error?error=oauth_failed", getBaseUrl(request)),
        );
    }
}

function getBaseUrl(request) {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    const forwarded = request.headers.get("x-forwarded-host");
    const host = forwarded || request.headers.get("host") || "localhost:3000";
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
}
