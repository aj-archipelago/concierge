import {
    escapeCardText,
    notificationEnvironment,
    sendGoogleChatMessage,
    googleChatErrorSummary,
} from "./google-chat-webhook.mjs";

export function buildWorkerMessage({
    queueName,
    failureRate,
    pendingJobs = null,
    oldestWaitingJobAgeMs = null,
    threshold = 0.2,
    environment = notificationEnvironment(),
    containerAppName = process.env.CONTAINER_APP_NAME || "local",
    now = new Date(),
}) {
    const pending = pendingJobs !== null;
    const title = pending
        ? "Queue Alert: High Pending Jobs"
        : "Queue Alert: High Failure Rate";
    const details = [
        ["Queue", queueName],
        ["Time", now.toISOString()],
        ...(pending
            ? [["Pending Jobs", pendingJobs]]
            : [
                  ["Failure Rate", `${(failureRate * 100).toFixed(2)}%`],
                  ["Threshold", `${(threshold * 100).toFixed(2)}%`],
                  ["Window", "10 minutes"],
              ]),
        ...(oldestWaitingJobAgeMs === null
            ? []
            : [
                  [
                      "Oldest waiting job age",
                      `${Math.floor(oldestWaitingJobAgeMs / 1000)} seconds`,
                  ],
              ]),
        ["Container App", containerAppName],
    ];
    const text = `Concierge ${title} (${environment}): ${queueName}; ${pending ? `${pendingJobs} pending jobs` : `${(failureRate * 100).toFixed(2)}% failures`}.`;
    return {
        text,
        cardsV2: [
            {
                cardId: "concierge-worker-alert",
                card: {
                    header: {
                        title,
                        subtitle: escapeCardText(environment, 100),
                    },
                    sections: [
                        {
                            widgets: [
                                {
                                    textParagraph: {
                                        text: details
                                            .map(
                                                ([label, value]) =>
                                                    `<b>${label}:</b> ${escapeCardText(value, 250)}`,
                                            )
                                            .join("<br>"),
                                    },
                                },
                            ],
                        },
                    ],
                },
            },
        ],
    };
}

export async function notifyWorkerAlert(details) {
    const webhook = process.env.GOOGLE_CHAT_WORKER_WEBHOOK_URL;
    if (!webhook) {
        console.error("GOOGLE_CHAT_WORKER_WEBHOOK_URL is not configured");
        return false;
    }
    try {
        const payload = buildWorkerMessage(details);
        return await sendGoogleChatMessage(webhook, payload, payload.text);
    } catch (error) {
        console.error(
            "Worker Google Chat notification failed",
            googleChatErrorSummary(error),
        );
        return false;
    }
}
