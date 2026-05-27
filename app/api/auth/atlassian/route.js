import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize";
const SCOPES = [
    "offline_access",
    "read:me",
    "read:jira-work",
    "write:jira-work",
    "read:confluence-content.all",
    "write:confluence-content",
].join(" ");

export async function GET(request) {
    try {
        const user = await getCurrentUser(false);
        if (!user?._id) {
            return NextResponse.redirect(
                new URL("/auth/error?error=unauthorized", getBaseUrl(request)),
            );
        }

        const clientId = process.env.NEXT_PUBLIC_ATLASSIAN_CLIENT_ID;
        if (!clientId) {
            console.error("NEXT_PUBLIC_ATLASSIAN_CLIENT_ID is not configured");
            return NextResponse.redirect(
                new URL(
                    "/auth/error?error=atlassian_not_configured",
                    getBaseUrl(request),
                ),
            );
        }

        const state = crypto.randomBytes(24).toString("hex");
        const redirectUri = `${getBaseUrl(request)}/api/auth/atlassian/callback`;

        const params = new URLSearchParams({
            audience: "api.atlassian.com",
            client_id: clientId,
            scope: SCOPES,
            redirect_uri: redirectUri,
            state,
            response_type: "code",
            prompt: "consent",
        });

        const authUrl = `${ATLASSIAN_AUTH_URL}?${params.toString()}`;

        const response = NextResponse.redirect(authUrl);
        response.cookies.set("atlassian_oauth_state", state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 600,
            path: "/",
        });
        response.cookies.set("atlassian_oauth_user_id", String(user._id), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 600,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Atlassian OAuth init error:", error);
        return NextResponse.redirect(
            new URL("/auth/error?error=oauth_failed", getBaseUrl(request)),
        );
    }
}

function getBaseUrl(request) {
    const forwarded = request.headers.get("x-forwarded-host");
    const host = forwarded || request.headers.get("host") || "localhost:3000";
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
}
