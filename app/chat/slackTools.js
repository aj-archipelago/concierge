// The actual Slack API call happens server-side at /api/slack/send so the
// encrypted bot token never leaves the server.

import { requestToolConfirmation, translateToolText } from "./toolInteraction";

export const SLACK_CONTEXTUAL_TOOLS = [
    {
        type: "function",
        icon: "💬",
        function: {
            name: "SendSlackMessage",
            description:
                "Send a Slack message via the Concierge bot. The message is posted by the Concierge app with a 'Sent by <user> via Concierge' attribution block above the body. It is not posted as the user's own Slack identity. Use for DMs to coworkers by email or Slack user ID, or for posting to channels by channel ID. Always state the recipient and exact message body to the user before invoking; this is a real outbound message.",
            descriptionAr:
                'أرسل رسالة Slack عبر بوت Concierge. تُنشَر الرسالة باسم تطبيق Concierge مع كتلة إسناد "أُرسلت من <المستخدم> عبر Concierge" فوق نص الرسالة. لا تُنشر باسم المستخدم في Slack. استخدمها للمحادثات الخاصة مع الزملاء بالبريد الإلكتروني أو معرّف مستخدم Slack، أو للنشر في القنوات بمعرّف القناة. اذكر دائماً المستلم ونص الرسالة كاملاً للمستخدم قبل الاستدعاء؛ فهذه رسالة خارجية حقيقية.',
            parameters: {
                type: "object",
                properties: {
                    to: {
                        type: "string",
                        description:
                            "Recipient. One of: a Slack channel ID starting with C, G, or D; a Slack user ID starting with U; or a user's email address.",
                    },
                    text: {
                        type: "string",
                        description:
                            "The message body in Slack mrkdwn. Plain text is fine.",
                    },
                    threadTs: {
                        type: "string",
                        description:
                            "Optional. Parent message timestamp to reply in-thread.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly one-line summary of the send, such as 'Sending DM to Jane about the deploy'.",
                    },
                },
                required: ["to", "text", "userMessage"],
            },
        },
    },
];

function getToolArgs(toolInfo) {
    return toolInfo.toolArgs || toolInfo;
}

export async function handleSendSlackMessage(toolInfo, context) {
    const { to, text, threadTs } = getToolArgs(toolInfo);

    if (!to || !text) {
        throw new Error("Both 'to' and 'text' are required.");
    }

    const confirmed = await requestToolConfirmation(context, {
        title: translateToolText(context, "Send Slack message?"),
        description:
            translateToolText(
                context,
                "Concierge will post this in Slack as the Concierge app, attributed to you:",
            ) + `\n\nTo: ${to}\n\n${text}`,
        confirmLabel: translateToolText(context, "Send"),
        cancelLabel: translateToolText(context, "Cancel"),
        fallbackMessage: `Send Slack message to ${to}?\n\n${text}`,
    });

    if (!confirmed) {
        return {
            success: false,
            cancelled: true,
            message: "User cancelled the send.",
        };
    }

    const res = await fetch("/api/slack/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text, threadTs }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `Slack send failed (${res.status})`);
    }
    return { success: true, data };
}

export const SLACK_TOOL_HANDLERS = {
    sendslackmessage: handleSendSlackMessage,
};
