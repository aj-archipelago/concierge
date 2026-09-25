import {
    escapeCardText,
    httpUrl,
    notificationEnvironment,
    sendGoogleChatMessage,
    googleChatErrorSummary,
} from "../utils/google-chat-webhook.mjs";

export function buildFeedbackMessage({
    feedback,
    adminUrl,
    environment = notificationEnvironment(),
}) {
    const link = httpUrl(adminUrl);
    const imageUrl = httpUrl(feedback.screenshotUrl);
    const widgets = [
        {
            textParagraph: {
                text: `<b>From:</b> ${escapeCardText(feedback.userName || feedback.username || "Unknown user", 200)}<br><b>Source:</b> ${feedback.source === "agent" ? "Agent" : "User"}<br><b>Category:</b> ${escapeCardText(feedback.category || "bug", 100)}${feedback.pageUrl ? `<br><b>Page:</b> ${escapeCardText(feedback.pageUrl, 500)}` : ""}`,
            },
        },
        { textParagraph: { text: escapeCardText(feedback.message) } },
    ];
    if (imageUrl)
        widgets.push({ image: { imageUrl, altText: "Feedback image" } });
    if (link)
        widgets.push({
            buttonList: {
                buttons: [
                    {
                        text: "View in admin",
                        onClick: { openLink: { url: link } },
                    },
                ],
            },
        });
    return {
        text: `New Concierge feedback (${environment}).${link ? ` ${link}` : ""}`,
        cardsV2: [
            {
                cardId: "concierge-feedback",
                card: {
                    header: {
                        title: "New Concierge feedback",
                        subtitle: escapeCardText(environment, 100),
                    },
                    sections: [{ widgets }],
                },
            },
        ],
    };
}

async function waitForImage(url) {
    try {
        const start = Date.parse(new URL(url).searchParams.get("st"));
        const delay = Math.min(5000, Math.max(0, start + 5000 - Date.now()));
        if (delay > 0)
            await new Promise((resolve) => setTimeout(resolve, delay));
    } catch {
        /* No valid SAS start timestamp; send immediately. */
    }
}

export async function notifyFeedback({ feedback, adminUrl }) {
    const webhook = process.env.GOOGLE_CHAT_FEEDBACK_WEBHOOK_URL;
    if (!webhook) {
        console.warn(
            "GOOGLE_CHAT_FEEDBACK_WEBHOOK_URL is not configured; feedback remains available in admin",
        );
        return false;
    }
    try {
        if (feedback.screenshotUrl) await waitForImage(feedback.screenshotUrl);
        const payload = buildFeedbackMessage({ feedback, adminUrl });
        return await sendGoogleChatMessage(webhook, payload, payload.text);
    } catch (error) {
        console.error(
            "Feedback Google Chat notification failed",
            googleChatErrorSummary(error),
        );
        return false;
    }
}
