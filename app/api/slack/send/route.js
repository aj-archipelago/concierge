import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";

export const dynamic = "force-dynamic";

const SLACK_API_BASE = "https://slack.com/api";

const CHANNEL_ID_RE = /^[CGD][A-Z0-9]+$/;
const USER_ID_RE = /^U[A-Z0-9]+$/;

// Slack error codes that should surface to the model so it can recover,
// for example by asking for a different recipient or prompting the user to
// add the bot to a channel, rather than appearing as an opaque server failure.
const ACTIONABLE_SLACK_ERRORS = new Set([
    "channel_not_found",
    "user_not_found",
    "users_not_found",
    "is_archived",
    "not_in_channel",
    "missing_scope",
    "no_permission",
    "restricted_action",
]);

class SlackApiError extends Error {
    constructor(method, code) {
        super(`slack ${method} failed: ${code}`);
        this.name = "SlackApiError";
        this.method = method;
        this.code = code;
    }
}

async function slackApi(method, botToken, { body, params } = {}) {
    const url = new URL(`${SLACK_API_BASE}/${method}`);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
    }

    const init = {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${botToken}` },
    };
    if (body) {
        init.headers["Content-Type"] = "application/json; charset=utf-8";
        init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    const data = await res.json();
    if (!data.ok) {
        throw new SlackApiError(method, data.error || "unknown");
    }
    return data;
}

async function resolveChannel(to, botToken) {
    if (CHANNEL_ID_RE.test(to)) {
        return to;
    }

    if (USER_ID_RE.test(to)) {
        const opened = await slackApi("conversations.open", botToken, {
            body: { users: to },
        });
        return opened.channel.id;
    }

    if (to.includes("@")) {
        const lookup = await slackApi("users.lookupByEmail", botToken, {
            params: { email: to },
        });
        const opened = await slackApi("conversations.open", botToken, {
            body: { users: lookup.user.id },
        });
        return opened.channel.id;
    }

    throw new Error(
        "Recipient must be a Slack channel ID, user ID, or email address",
    );
}

function buildBlocks({ text, senderName, senderAvatar }) {
    const contextElements = [];
    if (senderAvatar) {
        contextElements.push({
            type: "image",
            image_url: senderAvatar,
            alt_text: senderName,
        });
    }
    contextElements.push({
        type: "mrkdwn",
        text: `*Sent by ${senderName} via Concierge*`,
    });

    return [
        { type: "context", elements: contextElements },
        { type: "section", text: { type: "mrkdwn", text } },
    ];
}

export async function POST(request) {
    let user;
    try {
        user = await getCurrentUser(false);
    } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user?._id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const { to, text, threadTs } = body || {};
    if (!to || typeof to !== "string") {
        return NextResponse.json({ error: "Missing 'to'" }, { status: 400 });
    }
    if (!text || typeof text !== "string") {
        return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
    }

    const botToken = user?.mcpServers?.slack?.botToken;
    if (!botToken) {
        return NextResponse.json(
            {
                error: "Slack is not connected with bot scope. Reconnect Slack to enable sending.",
            },
            { status: 400 },
        );
    }

    const senderName = user.name || user.displayName || user.email || "Someone";
    const senderAvatar = user.profilePicture || user.avatarUrl;

    try {
        const channelId = await resolveChannel(to, botToken);
        const payload = {
            channel: channelId,
            text: `${senderName} via Concierge: ${text}`,
            blocks: buildBlocks({ text, senderName, senderAvatar }),
        };
        if (threadTs) {
            payload.thread_ts = threadTs;
        }

        const result = await slackApi("chat.postMessage", botToken, {
            body: payload,
        });
        return NextResponse.json({
            ok: true,
            ts: result.ts,
            channel: result.channel,
        });
    } catch (err) {
        if (
            err instanceof SlackApiError &&
            ACTIONABLE_SLACK_ERRORS.has(err.code)
        ) {
            return NextResponse.json(
                { error: `Slack: ${err.code}`, slackError: err.code },
                { status: 400 },
            );
        }
        console.error("Slack send failed:", err);
        return NextResponse.json(
            { error: "Failed to send Slack message" },
            { status: 500 },
        );
    }
}
