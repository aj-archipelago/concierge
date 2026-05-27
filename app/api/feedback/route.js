import axios from "../../utils/axios-client";
import Feedback from "../models/feedback";
import { getCurrentUser } from "../utils/auth";

const SLACK_SAS_START_SKEW_BUFFER_MS = 5_000;
const SLACK_IMAGE_READY_WAIT_MAX_MS = 5_000;

function getBaseUrl(request) {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    const forwarded = request.headers.get("x-forwarded-host");
    const host = forwarded || request.headers.get("host") || "localhost:3000";
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
}

function normalizeCategory(category) {
    if (["bug", "idea", "question", "other"].includes(category)) {
        return category;
    }
    return "bug";
}

function normalizeSource(source) {
    return source === "agent" ? "agent" : "user";
}

function truncateSlackText(text, maxLength = 2500) {
    const value = String(text || "").trim();
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 3)}...`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSasStartWaitMs(url) {
    try {
        const start = new URL(url).searchParams.get("st");
        if (!start) {
            return 0;
        }
        const startsAt = Date.parse(start);
        if (Number.isNaN(startsAt)) {
            return 0;
        }
        return Math.min(
            SLACK_IMAGE_READY_WAIT_MAX_MS,
            Math.max(0, startsAt + SLACK_SAS_START_SKEW_BUFFER_MS - Date.now()),
        );
    } catch {
        return 0;
    }
}

async function waitBrieflyForSlackImageReadiness(url) {
    const sasStartWaitMs = getSasStartWaitMs(url);
    if (sasStartWaitMs > 0) {
        await sleep(sasStartWaitMs);
    }
}

function buildSlackBlocks({ feedback, adminUrl, includeImage = true }) {
    const category = feedback.category || "bug";
    const source = feedback.source === "agent" ? "Agent" : "User";
    const submittedBy =
        feedback.userName || feedback.username || "Unknown user";
    const contextLines = [
        `*From:* ${submittedBy}`,
        `*Source:* ${source}`,
        `*Category:* ${category}`,
    ];

    if (feedback.pageUrl) {
        contextLines.push(
            `*Page:* ${truncateSlackText(feedback.pageUrl, 500)}`,
        );
    }
    if (feedback.screenshotUrl && !includeImage) {
        contextLines.push("*Image:* Attached in admin");
    }

    const blocks = [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*New Concierge feedback*\n${contextLines.join("\n")}`,
            },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: truncateSlackText(feedback.message),
            },
        },
        {
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "View in admin",
                    },
                    url: adminUrl,
                },
            ],
        },
    ];

    if (feedback.screenshotUrl && includeImage) {
        blocks.splice(2, 0, {
            type: "image",
            title: {
                type: "plain_text",
                text: "Attached image",
                emoji: true,
            },
            image_url: feedback.screenshotUrl,
            alt_text: "Feedback image",
        });
    }

    return blocks;
}

function buildSlackPayload({ feedback, adminUrl, includeImage }) {
    return {
        text: `New Concierge feedback from ${feedback.userName || feedback.username || "a user"}: ${adminUrl}`,
        blocks: buildSlackBlocks({
            feedback,
            adminUrl,
            includeImage,
        }),
    };
}

function getSlackErrorSummary(error) {
    return (
        error?.response?.data ||
        error?.message ||
        "Failed to send Slack notification"
    );
}

async function notifySlack({ feedback, adminUrl }) {
    if (!process.env.SLACK_WEBHOOK_URL) {
        return;
    }

    if (feedback.screenshotUrl) {
        await waitBrieflyForSlackImageReadiness(feedback.screenshotUrl);
    }

    try {
        await axios.post(
            process.env.SLACK_WEBHOOK_URL,
            buildSlackPayload({ feedback, adminUrl, includeImage: true }),
        );
        return;
    } catch (error) {
        console.error(
            "Error sending feedback Slack message:",
            getSlackErrorSummary(error),
        );
    }

    try {
        await axios.post(
            process.env.SLACK_WEBHOOK_URL,
            buildSlackPayload({ feedback, adminUrl, includeImage: false }),
        );
    } catch (error) {
        console.error(
            "Error sending fallback feedback Slack message:",
            getSlackErrorSummary(error),
        );
    }
}

function sendSlackNotificationInBackground({ feedback, adminUrl }) {
    void notifySlack({ feedback, adminUrl }).catch((error) => {
        console.error(
            "Error sending feedback Slack message:",
            getSlackErrorSummary(error),
        );
    });
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { message, screenshot, pageUrl, userAgent } = body;
        const trimmedMessage = String(message || "").trim();

        if (!trimmedMessage) {
            return Response.json(
                { error: "Feedback message is required" },
                { status: 400 },
            );
        }

        const user = await getCurrentUser();

        if (!user) {
            return Response.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const feedback = await Feedback.create({
            message: trimmedMessage,
            category: normalizeCategory(body.category),
            screenshotUrl: screenshot || null,
            pageUrl: pageUrl || null,
            userAgent: userAgent || null,
            source: normalizeSource(body.source),
            user: user._id || null,
            userName: user.name || null,
            username: user.username || null,
        });

        const adminUrl = `${getBaseUrl(req)}/admin/feedback?selected=${feedback._id}`;
        sendSlackNotificationInBackground({ feedback, adminUrl });

        return Response.json({
            success: true,
            feedbackId: feedback._id,
        });
    } catch (error) {
        console.error("Error saving feedback:", error);
        return Response.json(
            { error: "Failed to send feedback" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
