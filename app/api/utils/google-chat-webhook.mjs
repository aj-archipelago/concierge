const WEBHOOK_TIMEOUT_MS = 10_000;

export function escapeCardText(value, maxLength = 2500) {
    const text = String(value ?? "").trim();
    const truncated =
        text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
    return truncated
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
        .replaceAll("\n", "<br>");
}

export function notificationEnvironment() {
    return (
        process.env.GOOGLE_CHAT_NOTIFICATION_ENV ||
        process.env.WEBSITE_SLOT_NAME ||
        process.env.CONTAINER_APP_NAME ||
        "local"
    );
}

export function httpUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password
            ? url.href
            : null;
    } catch {
        return null;
    }
}

export function googleChatErrorSummary(error) {
    // Never log the request URL, response body or transport error message: each
    // can contain the webhook credential or submitted feedback.
    return {
        name: "GoogleChatNotificationError",
        status: Number.isInteger(error?.status) ? error.status : null,
    };
}

export async function sendGoogleChatMessage(webhookUrl, payload, fallbackText) {
    if (!webhookUrl) return false;
    const url = new URL(webhookUrl.trim());
    if (
        url.protocol !== "https:" ||
        url.hostname !== "chat.googleapis.com" ||
        url.port ||
        url.username ||
        url.password ||
        !/^\/v1\/spaces\/[^/]+\/messages$/.test(url.pathname) ||
        !url.searchParams.get("key") ||
        !url.searchParams.get("token")
    ) {
        throw new Error("Invalid Google Chat webhook configuration");
    }
    const post = async (body) => {
        const response = await fetch(url.href, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            redirect: "error",
            signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });
        await response.body?.cancel();
        if (!response.ok)
            throw Object.assign(
                new Error("Google Chat rejected the notification"),
                { status: response.status },
            );
        return true;
    };
    try {
        return await post(payload);
    } catch (error) {
        // A definite invalid-card response can safely fall back to plain text.
        // Do not retry ambiguous timeouts/server errors and duplicate a delivery.
        if (error.status === 400 && fallbackText)
            return post({ text: fallbackText });
        throw error;
    }
}
