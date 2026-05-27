import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import User from "../../../models/user.mjs";

export const dynamic = "force-dynamic";

const MCP_ATLASSIAN_URL = "https://mcp.atlassian.com/v1/mcp";

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

    const baseUrl = getBaseUrl(request);
    const redirectUri = `${baseUrl}/api/auth/atlassian/callback`;

    // closePopupHtml is built dynamically after token exchange (see below)
    // so the MCP server config can be included for mid-turn re-initialization.

    const errorHtml = (msg) => `
<!DOCTYPE html>
<html>
<head><title>Connection Failed</title></head>
<body>
<script>
	var message = { type: 'atlassian-oauth-complete', success: false, error: ${JSON.stringify(msg)} };
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
	    window.location.href = '/auth/error?error=oauth_failed&message=' + encodeURIComponent(${JSON.stringify(msg)});
	  }
	}
	</script>
<p>Error: ${escapeHtml(msg)}</p>
</body>
</html>`;

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
    const savedState = cookieStore.get("atlassian_oauth_state")?.value;
    const userId = cookieStore.get("atlassian_oauth_user_id")?.value;

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

    const clientId = process.env.NEXT_PUBLIC_ATLASSIAN_CLIENT_ID;
    const clientSecret = process.env.JIRA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return new NextResponse(
            errorHtml("Atlassian OAuth is not configured"),
            { headers: { "Content-Type": "text/html" } },
        );
    }

    try {
        const tokenRes = await fetch(`${baseUrl}/api/jira/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "authorization_code",
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
                scope: "offline_access",
            }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
            console.error("Atlassian token exchange failed:", tokenData);
            return new NextResponse(
                errorHtml("Failed to exchange authorization code"),
                { headers: { "Content-Type": "text/html" } },
            );
        }

        const accessToken = tokenData.access_token;
        if (!accessToken) {
            return new NextResponse(errorHtml("No access token received"), {
                headers: { "Content-Type": "text/html" },
            });
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
            url: MCP_ATLASSIAN_URL,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            refreshToken: tokenData.refresh_token,
            expiresAt: tokenData.expires_in
                ? Date.now() + tokenData.expires_in * 1000
                : undefined,
        };
        mcpServers.atlassian = serverConfig;
        // Also save to atlassian_api — this 3LO token has direct Jira API
        // access and is used by the applet SDK's service-token endpoint.
        mcpServers.atlassian_api = serverConfig;

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
<head><title>Atlassian Connected</title></head>
<body>
<script>
var message = { type: 'atlassian-oauth-complete', success: true, mcpServerConfig: ${JSON.stringify(runtimeConfig)} };
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
        response.cookies.delete("atlassian_oauth_state");
        response.cookies.delete("atlassian_oauth_user_id");

        return response;
    } catch (err) {
        console.error("Atlassian OAuth callback error:", err);
        return new NextResponse(errorHtml("Connection failed"), {
            headers: { "Content-Type": "text/html" },
        });
    }
}

function getBaseUrl(request) {
    const forwarded = request.headers.get("x-forwarded-host");
    const host = forwarded || request.headers.get("host") || "localhost:3000";
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
}
