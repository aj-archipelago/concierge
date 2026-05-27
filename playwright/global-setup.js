import { request } from "@playwright/test";
import fs from "fs";
import path from "path";

const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3001";

const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL || "test@example.com";

const storageStatePath = path.resolve("playwright/.auth/state.json");

const isStorageStateFresh = () => {
    if (!fs.existsSync(storageStatePath)) return false;

    const stats = fs.statSync(storageStatePath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs >= 6 * 60 * 60 * 1000) return false;

    let state = null;
    try {
        state = JSON.parse(fs.readFileSync(storageStatePath, "utf8"));
    } catch {
        return false;
    }

    const host = (() => {
        try {
            return new URL(baseURL).hostname;
        } catch {
            return null;
        }
    })();
    if (!host) return false;

    const tokenCookie = state?.cookies?.find(
        (cookie) => cookie.name === "local_auth_token",
    );
    if (!tokenCookie) return false;

    const cookieDomain = (tokenCookie.domain || "").replace(/^\./, "");
    if (cookieDomain && cookieDomain !== host) return false;

    if (tokenCookie.expires && tokenCookie.expires * 1000 < Date.now()) {
        return false;
    }

    return true;
};

export default async function globalSetup() {
    fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
    if (isStorageStateFresh()) {
        return;
    }

    const api = await request.newContext({ baseURL, timeout: 60000 });
    let response = null;
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            response = await api.post("/api/auth/local", {
                data: {
                    email: testEmail,
                    redirect_uri: "/chat/new",
                },
                timeout: 60000,
            });
            if (response.ok()) break;
        } catch (error) {
            lastError = error;
        }
    }

    if (!response?.ok()) {
        if (lastError) {
            throw lastError;
        }
        throw new Error(
            response
                ? `Local auth failed: ${response.status()}`
                : "Local auth failed: no response",
        );
    }

    // Warm the chat route to reduce cold-start latency in fast tests.
    await api.get("/chat/new").catch(() => undefined);

    await api.storageState({ path: storageStatePath });
    await api.dispose();
}
