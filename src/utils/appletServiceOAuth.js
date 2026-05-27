import i18n from "i18next";

/**
 * Run an external-service OAuth popup from the Concierge host window.
 * Used when applets run inside sandboxed iframes: the host opens the popup so
 * redirect + postMessage reliably reach this browsing context (see applet-sdk.js).
 *
 * @param {object} connectInfo - Same shape as service-token error.connectInfo
 * @param {string} connectInfo.service - "atlassian" | "github" | "slack"
 * @param {string} [connectInfo.mcpOAuthInit] - POST endpoint to obtain authorize URL
 * @param {string} [connectInfo.mcpOAuthRedirect] - Path for redirect_uri (e.g. /code/jira)
 * @param {string} [connectInfo.oauthUrl] - Direct start URL for OAuth
 * @returns {Promise<void>} Resolves when OAuth completes successfully
 */
export function runAppletServiceOAuth(connectInfo) {
    const t = i18n.t.bind(i18n);
    const service = connectInfo?.service;
    if (!service || typeof service !== "string") {
        return Promise.reject(new Error(t("connectInfo.service is required")));
    }

    let urlPromise;
    if (connectInfo.mcpOAuthInit) {
        const redirectUri =
            window.location.origin + (connectInfo.mcpOAuthRedirect || "");
        urlPromise = fetch(connectInfo.mcpOAuthInit, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ redirectUri }),
        }).then((res) =>
            res.json().then((data) => {
                if (!res.ok || !data.authorizeUrl) {
                    throw new Error(
                        data.error || t("Failed to initialize OAuth"),
                    );
                }
                return data.authorizeUrl;
            }),
        );
    } else if (connectInfo.oauthUrl) {
        const url = connectInfo.oauthUrl;
        urlPromise = Promise.resolve(
            url.startsWith("http") ? url : window.location.origin + url,
        );
    } else {
        return Promise.reject(
            new Error(t("No OAuth configuration for {{service}}", { service })),
        );
    }

    return urlPromise.then((authorizeUrl) => {
        return new Promise((resolve, reject) => {
            const width = 600;
            const height = 700;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;
            const popup = window.open(
                authorizeUrl,
                "concierge-applet-service-oauth",
                `width=${width},height=${height},left=${left},top=${top}`,
            );

            if (!popup) {
                const err = new Error(
                    t("Popup blocked. Allow popups to connect {{service}}.", {
                        service,
                    }),
                );
                err.code = "POPUP_BLOCKED";
                reject(err);
                return;
            }

            let settled = false;
            function settle(error) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                clearInterval(closedCheck);
                window.removeEventListener("message", onMessage);
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            }

            const timeout = setTimeout(() => {
                const err = new Error(
                    t("OAuth timed out for {{service}}.", { service }),
                );
                err.code = "OAUTH_TIMEOUT";
                settle(err);
            }, 240000);

            const expectedType = service + "-oauth-complete";
            function onMessage(event) {
                if (!event || event.origin !== window.location.origin) {
                    return;
                }
                if (event.source !== popup) {
                    return;
                }
                if (!event.data || event.data.type !== expectedType) {
                    return;
                }
                if (event.data.success) {
                    settle(null);
                } else {
                    const err = new Error(
                        event.data.error ||
                            t("OAuth failed for {{service}}", { service }),
                    );
                    err.code = "OAUTH_FAILED";
                    settle(err);
                }
            }
            window.addEventListener("message", onMessage);

            const closedCheck = setInterval(() => {
                if (popup && popup.closed) {
                    const err = new Error(
                        t("OAuth window was closed before completing."),
                    );
                    err.code = "OAUTH_CANCELLED";
                    settle(err);
                }
            }, 1000);
        });
    });
}
