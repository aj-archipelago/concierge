import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import User from "../../../models/user.mjs";

export const dynamic = "force-dynamic";

const MCP_SLACK_URL = "https://mcp.slack.com/mcp";

const escapeHtml = (unsafe) =>
    String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const getOauthErrorMessage = (errorCode) => {
    if (errorCode === "access_denied") {
        return "Authorization was denied";
    }

    return "Authorization failed";
};

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // closePopupHtml is built dynamically after token exchange (see below)
    // so the MCP server config can be included for mid-turn re-initialization.

    const errorHtml = (msg) => {
        const msgLiteral = JSON.stringify(String(msg));
        return `
<!DOCTYPE html>
<html>
<head><title>Connection Failed</title></head>
<body>
	<script>
	var message = { type: 'slack-oauth-complete', success: false, error: ${msgLiteral} };
	var sent = false;
	if (typeof BroadcastChannel !== 'undefined') {
	  try {
	    var channel = new BroadcastChannel('mcp-oauth');
	    channel.postMessage(message);
	    channel.close();
	    sent = true;
	  } catch (err) {}
	}
	if (!sent && window.opener) {
	  window.opener.postMessage(message, window.location.origin);
	  window.close();
	} else {
	  var errorMsg = ${msgLiteral};
	  if (sent) {
	    window.close();
	  } else {
	    window.location.href = '/auth/error?error=oauth_failed&message=' + encodeURIComponent(errorMsg);
	  }
	}
	</script>
<p>Error: ${escapeHtml(msg)}</p>
</body>
</html>`;
    };

    if (error) {
        return new NextResponse(errorHtml(getOauthErrorMessage(error)), {
            headers: { "Content-Type": "text/html" },
        });
    }

    if (!code || !state) {
        return new NextResponse(
            errorHtml("Missing authorization code or state"),
            { headers: { "Content-Type": "text/html" } },
        );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("slack_oauth_state")?.value;
    const userId = cookieStore.get("slack_oauth_user_id")?.value;

    if (!savedState || state !== savedState) {
        return new NextResponse(errorHtml("Invalid state - possible CSRF"), {
            headers: { "Content-Type": "text/html" },
        });
    }

    if (!userId) {
        return new NextResponse(errorHtml("Session expired"), {
            headers: { "Content-Type": "text/html" },
        });
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return new NextResponse(errorHtml("Slack OAuth is not configured"), {
            headers: { "Content-Type": "text/html" },
        });
    }

    try {
        const baseUrl = getBaseUrl(request);
        const redirectUri = `${baseUrl}/api/auth/slack/callback`;

        // Exchange code for tokens via Slack's OAuth endpoint
        const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.ok) {
            console.error("Slack token exchange failed:", tokenData);
            return new NextResponse(
                errorHtml(
                    tokenData.error || "Failed to exchange authorization code",
                ),
                { headers: { "Content-Type": "text/html" } },
            );
        }

        // mcp.slack.com only accepts user tokens, so we need both: user token
        // for MCP reads, bot token for our send route.
        const userAccessToken = tokenData.authed_user?.access_token;
        const botAccessToken = tokenData.access_token;
        if (!userAccessToken || !botAccessToken) {
            return new NextResponse(
                errorHtml("Missing user or bot token from Slack"),
                { headers: { "Content-Type": "text/html" } },
            );
        }

        const user = await User.findById(userId);
        if (!user) {
            return new NextResponse(errorHtml("User not found"), {
                headers: { "Content-Type": "text/html" },
            });
        }

        const mcpServers = { ...(user.mcpServers || {}) };
        const serverConfig = {
            type: "streamable-http",
            url: MCP_SLACK_URL,
            headers: {
                Authorization: `Bearer ${userAccessToken}`,
            },
            // Slack user tokens don't expire but we track refresh token if provided
            refreshToken: tokenData.authed_user?.refresh_token,
            expiresAt: tokenData.authed_user?.expires_in
                ? Date.now() + tokenData.authed_user.expires_in * 1000
                : undefined,
            botToken: botAccessToken,
            botUserId: tokenData.bot_user_id,
            teamId: tokenData.team?.id,
        };
        mcpServers.slack = serverConfig;

        user.mcpServers = mcpServers;
        await user.save();

        // Build runtime config for mid-turn MCP re-initialization (no refreshToken)
        const runtimeConfig = {
            type: serverConfig.type,
            url: serverConfig.url,
            headers: serverConfig.headers,
            expiresAt: serverConfig.expiresAt,
        };

        const closePopupHtml = `
<!DOCTYPE html>
<html>
<head><title>Slack Connected</title></head>
<body>
<script>
var message = { type: 'slack-oauth-complete', success: true, mcpServerConfig: ${JSON.stringify(runtimeConfig)} };
var sent = false;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    var channel = new BroadcastChannel('mcp-oauth');
    channel.postMessage(message);
    channel.close();
    sent = true;
  } catch (err) {}
}
if (!sent && window.opener) {
  window.opener.postMessage(message, window.location.origin);
  window.close();
} else {
  if (sent) {
    window.close();
  } else {
    window.location.href = '/';
  }
}
</script>
<p>Connection complete. You can close this window.</p>
</body>
</html>`;

        const response = new NextResponse(closePopupHtml, {
            headers: { "Content-Type": "text/html" },
        });
        response.cookies.delete("slack_oauth_state");
        response.cookies.delete("slack_oauth_user_id");

        return response;
    } catch (err) {
        console.error("Slack OAuth callback error:", err);
        return new NextResponse(errorHtml("Connection failed"), {
            headers: { "Content-Type": "text/html" },
        });
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
