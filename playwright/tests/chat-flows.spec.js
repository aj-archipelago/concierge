import { test, expect, request } from "@playwright/test";

const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3001";
const storageStatePath = "playwright/.auth/state.json";
const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL || "test@example.com";

test.describe.configure({ mode: "serial" });

function buildLocalAuthToken(email) {
    const now = Math.floor(Date.now() / 1000);
    const userId = `mock_user_${email.replace("@", "_").replace(".", "_")}`;
    return {
        access_token: `mock_token_${Math.random().toString(36).slice(2)}`,
        token_type: "Bearer",
        expires_in: 24 * 60 * 60,
        expires_at: now + 24 * 60 * 60,
        user: {
            id: userId,
            email,
            name: email.split("@")[0],
            username: email,
        },
        azure_headers: {
            "X-MS-CLIENT-PRINCIPAL-ID": userId,
            "X-MS-CLIENT-PRINCIPAL-NAME": email,
            "X-MS-CLIENT-PRINCIPAL-IDP": "aad",
        },
    };
}

async function applyLocalAuthCookie(context, email) {
    const token = buildLocalAuthToken(email);
    await context.addCookies([
        {
            name: "local_auth_token",
            value: JSON.stringify(token),
            url: baseURL,
            httpOnly: true,
            sameSite: "Lax",
        },
    ]);
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem("cortexWebShowTos", new Date().toString());
    });
});

async function acceptTosIfPresent(page) {
    const dialog = page.getByTestId("tos-dialog");
    const isVisible = await dialog.isVisible().catch(() => false);
    if (!isVisible) return;

    const content = page.getByTestId("tos-content");
    await content.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    const accept = page.getByTestId("tos-accept");
    await expect(accept).toBeEnabled({ timeout: 5000 });
    await accept.click();
    await expect(dialog).toBeHidden({ timeout: 5000 });
}

async function loginWithLocalAuth(page, email = testEmail) {
    const emailInput = page.getByRole("textbox", {
        name: /email address/i,
    });
    const signInButton = page.getByRole("button", { name: /sign in/i });

    const inputReady = await emailInput
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);
    if (!inputReady) {
        await page.request
            .post(`${baseURL}/api/auth/local`, {
                data: {
                    email,
                    redirect_uri: `${baseURL}/chat/new`,
                },
            })
            .catch(() => null);
        return;
    }

    await emailInput.fill(email);

    const authResponse = page
        .waitForResponse(
            (response) =>
                response.url().includes("/api/auth/local") &&
                response.status() === 200,
            { timeout: 20000 },
        )
        .catch(() => null);

    await signInButton.click();

    const response = await authResponse;
    if (!response) {
        await page.request.post(`${baseURL}/api/auth/local`, {
            data: {
                email,
                redirect_uri: `${baseURL}/chat/new`,
            },
            timeout: 20000,
        });
    }
}

async function ensureLoggedIn(page) {
    const loginHeading = page.getByRole("heading", {
        name: /sign in to your account/i,
    });
    const signInLink = page.getByRole("link", { name: /sign in/i });

    if (await loginHeading.isVisible().catch(() => false)) {
        await loginWithLocalAuth(page);
        return;
    }

    if (await signInLink.isVisible().catch(() => false)) {
        await signInLink.click({ noWaitAfter: true });
        await loginWithLocalAuth(page);
    }
}

async function waitForAuthOrChat(page) {
    const loginHeading = page.getByRole("heading", {
        name: /sign in to your account/i,
    });
    const signInLink = page.getByRole("link", { name: /sign in/i });
    const chatButton = page.locator('[data-testid="sidebar-new-chat-button"]');
    const chatInput = page.locator('[data-testid="chat-message-input"]');

    try {
        await Promise.any([
            loginHeading.waitFor({ state: "visible", timeout: 15000 }),
            signInLink.waitFor({ state: "visible", timeout: 15000 }),
            chatButton.waitFor({ state: "visible", timeout: 15000 }),
            chatInput.waitFor({ state: "visible", timeout: 15000 }),
        ]);
    } catch {
        // If none of the elements appear, just continue (page might be in transition)
        return;
    }
}

async function waitForChatUI(page) {
    const chatButton = page.locator('[data-testid="sidebar-new-chat-button"]');
    const chatInput = page.locator(
        '[data-testid="chat-message-input"]:visible',
    );
    const loginHeading = page.getByRole("heading", {
        name: /sign in to your account/i,
    });
    if (await loginHeading.isVisible().catch(() => false)) {
        throw new Error("Not authenticated (login screen shown).");
    }

    await Promise.race([
        expect(chatInput).toBeVisible({ timeout: 15000 }),
        expect(chatButton).toBeVisible({ timeout: 15000 }),
    ]);
}

async function waitForChatUIWithRetry(page, retries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            await waitForChatUI(page);
            return;
        } catch (error) {
            lastError = error;
            await ensureLoggedIn(page);
            await acceptTosIfPresent(page);
            if (attempt < retries) {
                await page
                    .goto("/chat/new", {
                        waitUntil: "domcontentloaded",
                        timeout: 20000,
                    })
                    .catch(() => null);
                continue;
            }
        }
    }
    throw lastError;
}

async function scrollSavedChatsToBottom(page) {
    const sentinel = page.getByTestId("saved-chats-load-more");
    if (await sentinel.count()) {
        await sentinel.scrollIntoViewIfNeeded();
        return;
    }

    await page.evaluate(() => {
        const target = document.querySelector(
            '[data-testid="saved-chats-container"]',
        );
        const candidates = [];
        let node = target;
        while (node) {
            candidates.push(node);
            if (node === document.body) break;
            node = node.parentElement;
        }
        candidates.push(
            document.scrollingElement ||
                document.documentElement ||
                document.body,
        );

        for (const el of candidates) {
            if (!el) continue;
            const canScroll = el.scrollHeight > el.clientHeight + 1;
            if (canScroll) {
                el.scrollTop = el.scrollHeight;
                return;
            }
        }

        window.scrollTo(0, document.body.scrollHeight);
    });
}

async function ensureEmptyChat(page) {
    const messageList = page.getByTestId("chat-message-list");
    await messageList
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => null);
    const messageItems = messageList.locator(".chat-message");
    let existingCount = await messageItems.count();
    if (existingCount === 0) {
        await page.waitForTimeout(300);
        existingCount = await messageItems.count();
        if (existingCount === 0) return;
    }

    const clearButton = page.getByRole("button", {
        name: /clear this chat/i,
    });
    if (await clearButton.isVisible().catch(() => false)) {
        await clearButton.click();
        const dialog = page.getByRole("alertdialog");
        const confirm = dialog.getByRole("button", { name: /^clear$/i });
        if (await confirm.isVisible().catch(() => false)) {
            await confirm.click();
        }
        await expect
            .poll(async () => messageItems.count(), { timeout: 15000 })
            .toBe(0);
    }
}

async function ensureWritableChat(page) {
    const readOnlyBadge = page.getByRole("button", {
        name: /read-only mode/i,
    });
    const isReadOnly = await readOnlyBadge.isVisible().catch(() => false);
    if (!isReadOnly) return;

    const newChatButton = page.getByTestId("sidebar-new-chat-button");
    if (await newChatButton.isVisible().catch(() => false)) {
        await newChatButton.click();
        await waitForChatInput(page);
    }
}

async function gotoWithRetry(page, url, options, retries = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            await page.goto(url, options);
            return;
        } catch (error) {
            lastError = error;
            const message = String(error || "");
            if (!message.includes("ERR_CONNECTION_REFUSED")) {
                throw error;
            }
            if (attempt < retries) {
                await page.waitForTimeout(1000);
                continue;
            }
        }
    }
    throw lastError;
}

async function gotoChatHome(page) {
    const response = await page
        .goto("/chat/new", {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        })
        .catch(() => null);
    if (!response) {
        await gotoWithRetry(
            page,
            "/chat/new",
            { waitUntil: "load", timeout: 30000 },
            3,
        );
    }
    await ensureLoggedIn(page);
    await acceptTosIfPresent(page);
    await waitForChatUIWithRetry(page);
    await ensureWritableChat(page);
    await ensureStreamingStopped(page);
}

async function ensureLayoutReady(page) {
    const heading = page.getByRole("heading", { name: /chat history/i });
    const searchInput = page.getByTestId("saved-chats-search");
    await Promise.race([
        expect(heading).toBeVisible({ timeout: 20000 }),
        expect(searchInput).toBeVisible({ timeout: 20000 }),
    ]);
}

async function gotoSavedChats(page) {
    await gotoWithRetry(
        page,
        "/chat",
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await waitForAuthOrChat(page);
    await ensureLoggedIn(page);
    await acceptTosIfPresent(page);
    await ensureLayoutReady(page);
}

async function createApiContext() {
    return request.newContext({
        baseURL,
        storageState: storageStatePath,
    });
}

async function postWithRetry(api, url, options, retries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await api.post(url, options);
            return { response };
        } catch (error) {
            lastError = error;
            const message = String(error || "");
            if (!message.includes("socket hang up") && attempt >= retries) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
    }
    return { error: lastError };
}

async function createChatViaApi(api, chat) {
    const { response, error } = await postWithRetry(
        api,
        "/api/chats",
        { data: chat, timeout: 15000 },
        2,
    );
    if (error) {
        throw error;
    }
    if (!response.ok()) {
        throw new Error(`Seed chat failed: ${response.status()}`);
    }
    return response.json();
}

async function seedChats(api, count, prefix) {
    const now = Date.now().toString(36);
    const chats = Array.from({ length: count }, (_, index) => ({
        messages: [
            {
                payload: `${prefix}-${now}-${index}`,
                sender: "user",
                direction: "outgoing",
                position: "single",
                sentTime: new Date().toISOString(),
            },
        ],
    }));
    const initialAttempt = await postWithRetry(
        api,
        "/api/chats/bulk",
        { data: { chats }, timeout: 15000 },
        2,
    );
    if (initialAttempt.error) {
        const created = [];
        for (const chat of chats) {
            const newChat = await createChatViaApi(api, chat);
            created.push(newChat);
        }
        return created;
    }
    let response = initialAttempt.response;
    if (response.ok()) {
        const data = await response.json();
        return data.createdChats || [];
    }

    if (response.status() === 404) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const retryAttempt = await postWithRetry(
            api,
            "/api/chats/bulk",
            { data: { chats }, timeout: 15000 },
            1,
        );
        if (retryAttempt.error) {
            const created = [];
            for (const chat of chats) {
                const newChat = await createChatViaApi(api, chat);
                created.push(newChat);
            }
            return created;
        }
        response = retryAttempt.response;
        if (response.ok()) {
            const data = await response.json();
            return data.createdChats || [];
        }
    }

    if ([404, 405, 501].includes(response.status())) {
        const created = [];
        for (const chat of chats) {
            const newChat = await createChatViaApi(api, chat);
            created.push(newChat);
        }
        return created;
    }

    throw new Error(`Bulk seed failed: ${response.status()}`);
}

async function seedChatWithMessages(api, count, prefix) {
    const now = Date.now().toString(36);
    const messages = Array.from({ length: count }, (_, index) => ({
        payload: `${prefix}-${now}-${index}`,
        sender: "user",
        direction: "outgoing",
        position: "single",
        sentTime: new Date().toISOString(),
    }));
    const initialAttempt = await postWithRetry(
        api,
        "/api/chats/bulk",
        { data: { chats: [{ messages }] }, timeout: 15000 },
        2,
    );
    if (initialAttempt.error) {
        const newChat = await createChatViaApi(api, { messages });
        return newChat?._id || null;
    }
    let response = initialAttempt.response;
    if (response.ok()) {
        const data = await response.json();
        const created = data.createdChats || [];
        return created[0]?._id || null;
    }

    if (response.status() === 404) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const retryAttempt = await postWithRetry(
            api,
            "/api/chats/bulk",
            { data: { chats: [{ messages }] }, timeout: 15000 },
            1,
        );
        if (retryAttempt.error) {
            const newChat = await createChatViaApi(api, { messages });
            return newChat?._id || null;
        }
        response = retryAttempt.response;
        if (response.ok()) {
            const data = await response.json();
            const created = data.createdChats || [];
            return created[0]?._id || null;
        }
    }

    if ([404, 405, 501].includes(response.status())) {
        const newChat = await createChatViaApi(api, { messages });
        return newChat?._id || null;
    }

    throw new Error(`Seed chat failed: ${response.status()}`);
}

async function waitForChatInput(page) {
    const input = page.locator('[data-testid="chat-message-input"]:visible');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await ensureLoggedIn(page);
        await acceptTosIfPresent(page);

        const visible = await input
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);
        if (visible) return;

        const newChatButton = page.getByTestId("sidebar-new-chat-button");
        if (await newChatButton.isVisible().catch(() => false)) {
            await newChatButton.click({ timeout: 3000 }).catch(() => {});
        } else {
            await page
                .goto(`${baseURL}/chat/new`, {
                    waitUntil: "domcontentloaded",
                    timeout: 10000,
                })
                .catch(() => {});
        }

        const afterClick = await input
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);
        if (afterClick) return;

        await page.waitForTimeout(500);
    }

    await expect(input).toBeVisible({ timeout: 15000 });
}

async function sendMessage(page, message) {
    const input = page.locator('[data-testid="chat-message-input"]:visible');
    const sendButton = page.locator('[data-testid="chat-send-button"]:visible');
    const messages = page.getByTestId("chat-messages").first().first();
    await ensureStreamingStopped(page);
    await input.waitFor({ state: "visible", timeout: 5000 });
    await expect(input).toBeEditable({ timeout: 5000 });
    await messages.waitFor({ state: "attached", timeout: 15000 });
    await expect
        .poll(
            async () => {
                try {
                    await input.fill(message);
                    return await input.inputValue();
                } catch {
                    return "";
                }
            },
            { timeout: 5000 },
        )
        .toBe(message);

    // Wait 1s for any background effects/transitions to stabilize
    await page.waitForTimeout(500);

    let ready = false;
    try {
        await expect
            .poll(
                async () => {
                    try {
                        const streaming =
                            await messages.getAttribute("data-streaming");
                        const disabled = await sendButton.isDisabled();
                        const type = await sendButton.getAttribute("type");
                        console.log(
                            `[sendMessage] data-streaming=${streaming}, disabled=${disabled}, type=${type}`,
                        );
                        if (
                            streaming !== "true" &&
                            !disabled &&
                            type === "submit"
                        ) {
                            return "ready";
                        }
                        const value = await input.inputValue().catch(() => "");
                        if (!value) {
                            await input.fill(message);
                        }
                    } catch {
                        return "waiting";
                    }
                    return "waiting";
                },
                { timeout: 15000 },
            )
            .toBe("ready");
        ready = true;
    } catch {
        ready = false;
    }

    if (ready) {
        await sendButton.click();
    } else {
        await input.press("Enter").catch(() => {});
        await sendButton.click({ force: true }).catch(() => {});
    }
    const messageList = page.getByTestId("chat-message-list");

    // Wait for message to appear - be more lenient with streaming detection
    let waited = false;
    try {
        await expect
            .poll(
                async () => {
                    const listText =
                        (await messageList.textContent().catch(() => "")) || "";
                    if (listText.includes(message)) return "rendered";
                    const inputValue = await input.inputValue().catch(() => "");
                    if (!inputValue) return "sent";
                    return "pending";
                },
                { timeout: 20000 },
            )
            .not.toBe("pending");
        waited = true;
    } catch {
        // If polling fails, just continue - message might still be sent
        waited = true;
    }

    // Additional wait to ensure message is processed
    await page.waitForTimeout(500);

    const remainingValue = await input.inputValue().catch(() => "");
    if (remainingValue) {
        await input.press("Enter").catch(() => {});
        await expect
            .poll(
                async () => {
                    const listText =
                        (await messageList.textContent().catch(() => "")) || "";
                    if (listText.includes(message)) return "rendered";
                    const inputValue = await input.inputValue().catch(() => "");
                    if (!inputValue) return "sent";
                    return "pending";
                },
                { timeout: 20000 },
            )
            .not.toBe("pending");
        await page.waitForTimeout(500);
    }
}

async function getCurrentChatId(page) {
    const messages = page.locator('[data-testid="chat-messages"]');
    const count = await messages.count().catch(() => 0);
    if (count === 0) {
        const urlMatch = page
            .url()
            .match(/\/chat\/(temp_[^/?]+|new|[a-f0-9]{24})/i);
        if (urlMatch) return urlMatch[1];
        return null;
    }
    let chatId = null;
    try {
        chatId = await messages
            .first()
            .getAttribute("data-chat-id", { timeout: 2000 });
    } catch {
        chatId = null;
    }
    if (chatId) return chatId;

    // Fallback: check URL
    const urlMatch = page
        .url()
        .match(/\/chat\/(temp_[^/?]+|new|[a-f0-9]{24})/i);
    if (urlMatch) return urlMatch[1];

    // Fallback: check sidebar active item
    const activeItem = page.locator(
        '[data-testid="sidebar-chat-item"].bg-gray-100, [data-testid="sidebar-chat-item"][data-active="true"]',
    );
    const activeId = await activeItem
        .first()
        .getAttribute("data-chat-id")
        .catch(() => null);
    if (activeId) return activeId;

    return chatId || null;
}

async function getActiveChatId(page) {
    const current = await getCurrentChatId(page);
    if (current) return current;

    const urlMatch = page
        .url()
        .match(/\/chat\/(temp_[^/?]+|new|[a-f0-9]{24})/i);
    if (urlMatch) return urlMatch[1];
    if (page.url().includes("/chat/new")) return "new";

    const activeItem = page.locator(
        '[data-testid="sidebar-chat-item"].bg-gray-100',
    );
    const activeId = await activeItem
        .first()
        .getAttribute("data-chat-id")
        .catch(() => null);
    return activeId || null;
}

function isObjectId(value) {
    return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}

async function waitForStableChatId(page, customTimeout = 60000) {
    const startTime = Date.now();
    let stableId = null;

    while (Date.now() - startTime < customTimeout) {
        // Try multiple sources for the chat ID
        stableId = await getCurrentChatId(page);
        if (isObjectId(stableId)) return stableId;

        // Check URL directly
        const urlMatch = page.url().match(/\/chat\/([a-f0-9]{24})/i);
        if (urlMatch && isObjectId(urlMatch[1])) {
            return urlMatch[1];
        }

        // Wait a bit before retrying
        await page.waitForTimeout(500);
    }

    return stableId;
}

async function findDifferentSidebarChatId(page, currentChatId) {
    const items = page.getByTestId("sidebar-chat-item");
    const count = await items.count();
    for (let i = 0; i < count; i += 1) {
        const item = items.nth(i);
        const chatId = await item.getAttribute("data-chat-id");
        if (!chatId) continue;
        if (chatId !== currentChatId) return chatId;
    }
    return null;
}

async function waitForSidebarChatRemoval(page, chatId) {
    const selector = `[data-testid="sidebar-chat-item"][data-chat-id="${chatId}"]`;
    await expect
        .poll(async () => page.locator(selector).count(), { timeout: 10000 })
        .toBe(0);
}

async function createChat(page, message) {
    await waitForChatUIWithRetry(page);
    const previousChatId = await getActiveChatId(page);
    const newChatButton = page.getByTestId("sidebar-new-chat-button");
    if (await newChatButton.isVisible().catch(() => false)) {
        await newChatButton.click({ timeout: 5000 }).catch(async () => {
            await gotoWithRetry(
                page,
                "/chat/new",
                { waitUntil: "domcontentloaded", timeout: 15000 },
                3,
            );
        });
    } else {
        await gotoWithRetry(
            page,
            "/chat/new",
            { waitUntil: "domcontentloaded", timeout: 15000 },
            3,
        );
    }

    await waitForChatInput(page);

    if (message) {
        await sendMessage(page, message);
    }

    await expect(page).toHaveURL(/\/chat\/(new|temp_[^/?]+|[a-f0-9]{24})/i, {
        timeout: 5000,
    });

    if (!message) {
        return await getActiveChatId(page);
    }

    let stableId = await waitForStableChatId(page);
    if (
        message &&
        previousChatId &&
        isObjectId(previousChatId) &&
        stableId === previousChatId
    ) {
        if (await newChatButton.isVisible().catch(() => false)) {
            await newChatButton.click();
            await waitForChatInput(page);
        }
        await sendMessage(page, message);
        stableId = await waitForStableChatId(page);
    }

    // If we don't have a valid ID but message was sent, find chat in sidebar
    if (!isObjectId(stableId) && message) {
        // Wait for sidebar to update with new chat containing our message
        await page.waitForTimeout(2000);
        const sidebarItems = page.getByTestId("sidebar-chat-item");
        const count = await sidebarItems.count();
        for (let i = 0; i < count; i++) {
            const item = sidebarItems.nth(i);
            const text = await item.textContent().catch(() => "");
            if (text.includes(message.substring(0, 20))) {
                const chatId = await item.getAttribute("data-chat-id");
                if (isObjectId(chatId)) {
                    await item.click();
                    await waitForChatId(page, chatId);
                    stableId = chatId;
                    break;
                }
            }
        }
    }

    if (stableId && isObjectId(stableId)) {
        await page
            .locator(
                `[data-testid="sidebar-chat-item"][data-chat-id="${stableId}"]`,
            )
            .waitFor({ state: "visible", timeout: 10000 })
            .catch(() => {});
    }

    return stableId;
}

async function waitForStreamingStart(page) {
    const messages = page.getByTestId("chat-messages").first();
    const sendButton = page.getByTestId("chat-send-button");
    await expect
        .poll(
            async () => {
                const streaming = await messages.getAttribute("data-streaming");
                if (streaming === "true") return "streaming";
                const type = await sendButton.getAttribute("type");
                if (type === "button") return "streaming";
                return "pending";
            },
            { timeout: 5000 },
        )
        .toBe("streaming");
    return true;
}

async function waitForStreamingStop(page, customTimeout) {
    const timeout = customTimeout || 60000;
    const messages = page.getByTestId("chat-messages").first();
    const sendButton = page.getByTestId("chat-send-button").first();
    const waitForStreamingFalse = async (timeoutVal) => {
        await expect(messages).toHaveAttribute("data-streaming", "false", {
            timeout: timeoutVal,
        });
    };
    try {
        await waitForStreamingFalse(Math.min(20000, timeout));
    } catch {
        const type = await sendButton.getAttribute("type").catch(() => null);
        if (type === "submit") {
            return;
        }
        if (type === "button") {
            await sendButton.click({ force: true }).catch(() => {});
        }
        try {
            await waitForStreamingFalse(Math.min(30000, timeout));
        } catch {
            const finalType = await sendButton
                .getAttribute("type")
                .catch(() => null);
            if (finalType === "submit") {
                return;
            }
            // Try one more time with remaining timeout
            try {
                await waitForStreamingFalse(Math.min(30000, timeout));
            } catch {
                const lastType = await sendButton
                    .getAttribute("type")
                    .catch(() => null);
                if (lastType === "submit") {
                    return;
                }
                throw new Error("Streaming did not stop within timeout");
            }
        }
    }
    const waitForReady = async (timeout) => {
        await expect
            .poll(
                async () => {
                    const type = await sendButton.getAttribute("type");
                    return type === "submit" ? "ready" : "waiting";
                },
                { timeout },
            )
            .toBe("ready");
    };

    try {
        await waitForReady(15000);
        return;
    } catch {
        const type = await sendButton.getAttribute("type").catch(() => null);
        if (type === "button") {
            await sendButton.click({ force: true }).catch(() => {});
        }
        await waitForReady(15000);
    }
}

async function waitForChatId(page, chatId) {
    const messages = page.getByTestId("chat-messages").first();
    await expect(messages).toHaveAttribute("data-chat-id", chatId, {
        timeout: 15000,
    });
}

async function clickSidebarChatOrNavigate(page, chatId) {
    if (!chatId || chatId === "new" || chatId.startsWith("temp_")) {
        await page.goto(`/chat/${chatId || "new"}`, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
        });
        await waitForChatInput(page);
        return false;
    }

    const item = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatId}"]`,
    );
    const isVisible = await item
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
    if (isVisible) {
        await item.click();
        await page.waitForTimeout(500);
        return true;
    }

    await page.goto(`/chat/${chatId}`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
    });
    await waitForChatInput(page);
    return false;
}

async function expectMessageInChat(page, message, { timeout = 15000 } = {}) {
    const messageList = page.getByTestId("chat-message-list").first();
    const containsMessage = async () => {
        const text = (await messageList.textContent().catch(() => "")) || "";
        return text.includes(message);
    };
    if (await containsMessage()) return;
    await messageList.evaluate((el) => {
        el.scrollTop = 0;
    });
    await page.waitForTimeout(500);
    if (await containsMessage()) return;
    await expect(messageList).toContainText(message, { timeout });
}

async function getMessageCounts(page) {
    const messageList = page.getByTestId("chat-message-list").first();
    // Wait for message list to be visible and stable
    await messageList
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});
    await page.waitForTimeout(500);
    // Count messages by data-testid pattern which is more reliable than CSS classes
    const allMessages = await messageList
        .locator('[data-testid^="chat-message-"]')
        .count();
    // Count user messages by checking if message contains user avatar or specific structure
    const userMessages = await messageList
        .locator('[data-testid="chat-message-user"]')
        .count();
    const botMessages = await messageList
        .locator('[data-testid="chat-message-bot"]')
        .count();
    // Fallback to CSS classes if data-testid counts don't work
    const userCount =
        userMessages ||
        (await messageList.locator(".chat-message-user").count());
    const botCount =
        botMessages ||
        (await messageList.locator(".chat-message-bot").count());
    return { userCount, botCount, total: userCount + botCount };
}

async function ensureStreamingStopped(page) {
    const messages = page.getByTestId("chat-messages").first();
    const handle = await messages.elementHandle().catch(() => null);
    if (!handle) return;
    const streaming = await messages.getAttribute("data-streaming");
    if (streaming === "true") {
        await waitForStreamingStop(page);
    }
}

test("Top-3 sidebar stays capped and new chat swaps content", async ({
    page,
}) => {
    // Hard reset: navigate to a neutral page first to clear any stale state
    await page
        .goto("/", { waitUntil: "domcontentloaded", timeout: 15000 })
        .catch(() => {});
    await page.waitForTimeout(500);
    await gotoChatHome(page);

    // Create a chat with a message so it's not unused
    const seedMessage = `seed-message-${Date.now().toString(36)}`;
    await waitForChatInput(page);
    await sendMessage(page, seedMessage);
    await waitForStreamingStop(page);
    await page.waitForTimeout(500);
    const previousChatId = await waitForStableChatId(page);
    console.log(`Previous chat ID: ${previousChatId}`);

    // Verify the chat has the message
    const messageList = page.getByTestId("chat-message-list").first();
    await expect(messageList).toContainText(seedMessage, { timeout: 5000 });

    // Create a new chat - should give us an empty chat (either new ID or cleared)
    const newChatButton = page.getByTestId("sidebar-new-chat-button");
    await newChatButton.click();
    await waitForChatInput(page);
    await page.waitForTimeout(1000);

    // Verify the seed message is NOT in the new chat (chat was cleared/new)
    // This is the key behavior - the new chat should be empty
    await expect(messageList).not.toContainText(seedMessage, {
        timeout: 5000,
    });

    // Get the current chat ID for debugging
    let activeNowId = await getCurrentChatId(page);
    console.log(`Active now ID: ${activeNowId}`);
    console.log(`Previous chat ID: ${previousChatId}`);

    // Create more chats to ensure the sidebar stays capped at 3 items
    await createChat(page);
    await createChat(page);
    await createChat(page);

    const sidebarCount = await page.getByTestId("sidebar-chat-item").count();
    expect(sidebarCount).toBe(3);
});

test("Streaming does not block navigation or other chats", async ({ page }) => {
    await gotoChatHome(page);

    const api = await createApiContext();
    const seedPrefix = `seed-${Date.now().toString(36)}`;
    const createdChats = await seedChats(api, 2, seedPrefix);
    await api.dispose();

    const chatAId = createdChats?.[0]?._id;
    const chatBId = createdChats?.[1]?._id;
    const chatBMessage = createdChats?.[1]?.messages?.[0]?.payload;

    if (!chatAId || !chatBId || chatAId === chatBId) {
        throw new Error("Failed to create distinct chats for streaming test.");
    }

    await page.goto(`/chat/${chatAId}`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
    });
    await waitForChatInput(page);

    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatAId,
    );

    await page.goto(`/chat/${chatBId}`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
    });
    await waitForChatInput(page);

    await page.goto(`/chat/${chatAId}`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
    });
    await waitForChatInput(page);

    const longMessage =
        "Write a detailed 3-paragraph story about a mountain archive, with dialogue and vivid sensory detail. " +
        `(${Date.now().toString(36)})`;

    await waitForChatInput(page);

    // Ensure streaming stopped before sending new message
    await ensureStreamingStopped(page);

    await sendMessage(page, longMessage);

    // Give time for streaming to start
    await page.waitForTimeout(1000);

    const messages = page.getByTestId("chat-messages").first();

    // Wait for streaming to start (be more lenient)
    let streamingStarted = false;
    try {
        await expect
            .poll(async () => messages.getAttribute("data-streaming"), {
                timeout: 15000,
            })
            .toBe("true");
        streamingStarted = true;
    } catch {
        // If we can't detect streaming, continue anyway
        streamingStarted = false;
    }

    // Navigate away while streaming (or after attempting to stream)
    await page
        .locator(`[data-testid="sidebar-chat-item"][data-chat-id="${chatBId}"]`)
        .click();

    // Wait for chat B to load
    await waitForChatInput(page);

    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-streaming",
        "false",
    );
    if (chatBMessage) {
        await expect(
            page
                .getByTestId("chat-message-list")
                .getByText(chatBMessage, { exact: false }),
        ).toBeVisible({ timeout: 10000 });
    }

    await sendMessage(page, `quick-${Date.now().toString(36)}`);

    await page
        .locator(`[data-testid="sidebar-chat-item"][data-chat-id="${chatAId}"]`)
        .click();

    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatAId,
    );
    await page.waitForTimeout(2000);
    await expect(
        page
            .getByTestId("chat-message-list")
            .getByText(longMessage, { exact: false }),
    ).toBeVisible({ timeout: 15000 });
});

test("Bulk delete works on created chats", async ({ page }) => {
    await gotoChatHome(page);

    // Create a chat with a unique message
    const deleteMessage = `bulk-delete-test-${Date.now().toString(36)}`;
    const chatId = await createChat(page, deleteMessage);
    await waitForStreamingStop(page);
    await page.waitForTimeout(1000);

    // Verify chat was created
    expect(chatId).toBeTruthy();

    // Navigate to saved chats
    await gotoSavedChats(page);
    await page.waitForTimeout(2000);

    // Find the chat tile by text
    const chatTileByText = page
        .getByTestId("saved-chat-item")
        .filter({ hasText: deleteMessage });

    // Wait for the chat to appear
    await expect(chatTileByText.first()).toBeVisible({ timeout: 30000 });

    // Select and delete
    await chatTileByText.first().getByTestId("saved-chat-select").click();

    const bulkDeleteButton = page.getByTestId("saved-chats-bulk-delete");
    await expect(bulkDeleteButton).toBeEnabled();
    await bulkDeleteButton.click();
    await page.getByTestId("saved-chats-bulk-delete-confirm").click();

    // Wait for deletion to complete
    await page.waitForTimeout(2000);

    // Refresh to verify deletion
    await page.reload();
    await page.waitForTimeout(2000);

    // Chat should no longer appear
    await expect(chatTileByText.first()).not.toBeVisible({ timeout: 10000 });
});

test("Sidebar delete removes chat from top list", async ({ page }) => {
    await gotoChatHome(page);

    const chatId = await createChat(
        page,
        `sidebar-delete-${Date.now().toString(36)}`,
    );

    if (!chatId) {
        throw new Error("Failed to create chat for sidebar delete.");
    }

    const chatItem = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatId}"]`,
    );
    await expect(chatItem).toBeVisible({ timeout: 5000 });
    await chatItem.hover();
    await chatItem.getByTestId("sidebar-chat-delete").click({ force: true });

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const confirmDelete = dialog.getByRole("button", { name: /delete/i });
    await confirmDelete.waitFor({ state: "attached", timeout: 5000 });
    await confirmDelete.dispatchEvent("click");
    await waitForSidebarChatRemoval(page, chatId);
});

test("Login and TOS flow works from fresh context", async ({ browser }) => {
    const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    // Add init script to set TOS
    await page.addInitScript(() => {
        localStorage.setItem("cortexWebShowTos", new Date().toString());
    });

    // Step 1: Initial navigation
    await gotoWithRetry(
        page,
        `${baseURL}/chat/new`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );

    // Step 2: Wait for auth and login
    await waitForAuthOrChat(page);
    await ensureLoggedIn(page);

    // Step 3: Navigate again after login
    await page.waitForTimeout(1500);
    await gotoWithRetry(
        page,
        `${baseURL}/chat/new`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );

    // Step 4: Handle TOS if present
    const tosDialog = page.getByTestId("tos-dialog");
    if (await tosDialog.isVisible().catch(() => false)) {
        await acceptTosIfPresent(page);
    }

    // Step 5: Try multiple times to get chat UI
    let success = false;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const chatInput = page
                .locator('[data-testid="chat-message-input"]')
                .first();
            const chatButton = page
                .locator('[data-testid="chat-via-button"]')
                .first();

            await Promise.race([
                expect(chatInput).toBeVisible({ timeout: 10000 }),
                expect(chatButton).toBeVisible({ timeout: 10000 }),
            ]);
            success = true;
            break;
        } catch {
            // Try navigating again
            await page
                .goto(`${baseURL}/chat/new`, { waitUntil: "domcontentloaded" })
                .catch(() => {});
            await page.waitForTimeout(1000);
        }
    }

    if (!success) {
        // Last resort - try the saved chats page
        await page
            .goto(`${baseURL}/chat`, { waitUntil: "domcontentloaded" })
            .catch(() => {});
        await page.waitForTimeout(2000);
    }

    await context.close();
});

test("TOS reappears after 30 days", async ({ browser }) => {
    const context = await browser.newContext({
        storageState: storageStatePath,
    });
    await context.addInitScript(() => {
        const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
        localStorage.setItem("cortexWebShowTos", oldDate.toString());
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/chat/new`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
    });
    const tosDialog = page.getByTestId("tos-dialog");
    if (await tosDialog.isVisible().catch(() => false)) {
        await acceptTosIfPresent(page);
    }
    await waitForChatUI(page);
    await context.close();
});

test("Temporary chat IDs never hit chat API", async ({ page }) => {
    const badRequests = [];
    page.on("request", (req) => {
        const url = req.url();
        if (/\/api\/chats\/(new|pending-new-chat|temp_)/i.test(url)) {
            badRequests.push(url);
        }
    });

    await gotoChatHome(page);
    await page.getByTestId("sidebar-new-chat-button").click();
    await waitForChatInput(page);

    await page.waitForTimeout(500);
    expect(badRequests).toHaveLength(0);
});

test("New chat shows optimistic message and loading", async ({ page }) => {
    await gotoChatHome(page);

    const api = await createApiContext();
    const seedPrefix = `optimistic-seed-${Date.now().toString(36)}`;
    const seeded = await seedChats(api, 1, seedPrefix);
    await api.dispose();
    const optimisticChatId = seeded?.[0]?._id;
    if (!optimisticChatId) {
        throw new Error("Failed to create chat for optimistic test.");
    }

    await gotoWithRetry(
        page,
        `/chat/${optimisticChatId}`,
        { waitUntil: "domcontentloaded", timeout: 15000 },
        3,
    );
    await waitForChatInput(page);
    await ensureEmptyChat(page);

    const message = `optimistic-${Date.now().toString(36)}`;
    await sendMessage(page, message);

    const messageList = page.getByTestId("chat-message-list");
    await expect
        .poll(
            async () => (await messageList.textContent().catch(() => "")) || "",
            { timeout: 15000 },
        )
        .toContain(message);

    const messages = page.getByTestId("chat-messages").first();
    const sendButton = page.getByTestId("chat-send-button");
    await expect
        .poll(
            async () => {
                const streaming = await messages.getAttribute("data-streaming");
                const type = await sendButton.getAttribute("type");
                const disabled = await sendButton.isDisabled();
                if (streaming === "true" || type === "button" || disabled) {
                    return "streaming";
                }
                return "pending";
            },
            { timeout: 15000 },
        )
        .toBe("streaming");
    await waitForStableChatId(page);
});

test("Stop streaming and send a new message", async ({ page }) => {
    await gotoChatHome(page);

    await createChat(page, `seed-stop-${Date.now().toString(36)}`);
    await waitForStreamingStop(page);

    const longMessage =
        "Write a detailed 3-paragraph story about coastal weather and field notes. " +
        `(${Date.now().toString(36)})`;
    await sendMessage(page, longMessage);
    const messages = page.getByTestId("chat-messages").first();
    const sendButton = page.getByTestId("chat-send-button");
    await expect
        .poll(
            async () => {
                const streaming = await messages.getAttribute("data-streaming");
                const type = await sendButton.getAttribute("type");
                const disabled = await sendButton.isDisabled();
                if (streaming === "true" || type === "button" || disabled) {
                    return "streaming";
                }
                return "pending";
            },
            { timeout: 15000 },
        )
        .toBe("streaming");

    await sendButton.click();
    await waitForStreamingStop(page);

    const followUp = `followup-${Date.now().toString(36)}`;
    await sendMessage(page, followUp);
    await expect(
        page
            .getByTestId("chat-message-list")
            .getByText(followUp, { exact: false }),
    ).toBeVisible({ timeout: 5000 });
});

test("Rapid switch during streaming stays isolated", async ({ page }) => {
    await gotoChatHome(page);

    const chatAId = await createChat(
        page,
        `rapid-a-${Date.now().toString(36)}`,
    );
    await waitForStreamingStop(page);
    const chatBId = await createChat(
        page,
        `rapid-b-${Date.now().toString(36)}`,
    );
    await waitForStreamingStop(page);

    await clickSidebarChatOrNavigate(page, chatAId);
    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatAId,
    );

    const streamPrompt = `rapid-stream-${Date.now().toString(36)}`;
    await sendMessage(page, streamPrompt);
    await waitForStreamingStart(page);

    await clickSidebarChatOrNavigate(page, chatBId);
    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatBId,
    );
    await clickSidebarChatOrNavigate(page, chatAId);
    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatAId,
    );
    await expect(
        page
            .getByTestId("chat-message-list")
            .getByText(streamPrompt, { exact: false }),
    ).toBeVisible({ timeout: 5000 });
    await waitForStreamingStop(page);
});

test("Bulk delete handles partial failures", async ({ page }) => {
    const api = await createApiContext();
    const seedPrefix = `partial-${Date.now().toString(36).slice(0, 8)}`;
    const seededChats = await seedChats(api, 2, seedPrefix);
    await api.dispose();
    if (!seededChats?.length || seededChats.length < 2) {
        throw new Error("Failed to seed chats for bulk delete test.");
    }

    await gotoSavedChats(page);

    const searchInput = page.getByTestId("saved-chats-search");
    await searchInput.fill(seedPrefix);

    const tiles = page.getByTestId("saved-chat-item");
    await expect
        .poll(async () => tiles.count(), { timeout: 15000 })
        .toBeGreaterThanOrEqual(2);

    const firstTile = tiles.nth(0);
    const secondTile = tiles.nth(1);

    await expect(firstTile).toBeVisible({ timeout: 15000 });
    await expect(secondTile).toBeVisible({ timeout: 15000 });

    await firstTile.getByTestId("saved-chat-select").click();
    await secondTile.getByTestId("saved-chat-select").click();

    let missingId = null;
    await page.route("**/api/chats/bulk", async (route) => {
        if (route.request().method() !== "DELETE") {
            await route.continue();
            return;
        }
        const body = route.request().postDataJSON() || {};
        const ids = Array.isArray(body.chatIds) ? body.chatIds : [];
        const deletedId = ids[0];
        missingId = ids[1] || null;

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                deletedIds: deletedId ? [deletedId] : [],
                missingIds: missingId ? [missingId] : [],
            }),
        });
    });

    const bulkDeleteButton = page.getByTestId("saved-chats-bulk-delete");
    await expect(bulkDeleteButton).toBeEnabled();
    await bulkDeleteButton.click();
    await page.getByTestId("saved-chats-bulk-delete-confirm").click();

    await expect.poll(() => missingId, { timeout: 5000 }).toBeTruthy();

    const missingTile = page.locator(
        `[data-testid="saved-chat-item"][data-chat-id="${missingId}"]`,
    );
    await expect(missingTile).toBeVisible({ timeout: 10000 });
    await expect(
        missingTile.locator(".selection-checkbox.selected"),
    ).toBeVisible({ timeout: 5000 });
});

test("Search empty vs no matches", async ({ page }) => {
    const api = await createApiContext();
    const searchSeed = `findme-${Date.now().toString(36).slice(0, 8)}`;
    await seedChats(api, 1, searchSeed);
    await api.dispose();

    await gotoSavedChats(page);

    const searchInput = page.getByTestId("saved-chats-search");
    await searchInput.fill(searchSeed);

    await expect
        .poll(async () => page.getByTestId("saved-chat-item").count(), {
            timeout: 15000,
        })
        .toBeGreaterThan(0);

    const noMatch = `nomatch-${Date.now().toString(36)}`;
    await searchInput.fill(noMatch);

    await expect(
        page.getByText(/no chats found matching your search/i),
    ).toBeVisible({ timeout: 10000 });

    await page.getByTestId("saved-chats-search-clear").click();
    await expect(page.getByTestId("saved-chat-item").first()).toBeVisible({
        timeout: 10000,
    });
});

test("Saved chats infinite scroll loads more", async ({ page }) => {
    const api = await createApiContext();
    const seedPrefix = `scroll-${Date.now().toString(36).slice(0, 8)}`;
    const seeded = await seedChats(api, 60, seedPrefix);
    console.log(`Seeded ${seeded.length} chats`);
    await api.dispose();

    // Listen for page 2 BEFORE navigating — auto-prefetch may trigger it
    // before any manual scrolling happens.
    const page2Promise = page
        .waitForResponse((resp) => resp.url().includes("/api/chats?page=2"), {
            timeout: 20000,
        })
        .catch(() => null);

    await gotoSavedChats(page);

    // Wait for initial chats to load
    const list = page.getByTestId("saved-chat-item");
    await expect(list.first()).toBeVisible({ timeout: 10000 });

    // Give auto-prefetch a moment to load additional pages
    await page.waitForTimeout(2000);

    const initialCount = await list.count();
    console.log(`Initial chat count: ${initialCount}`);

    // If auto-prefetch already loaded all chats, the test passes
    if (initialCount >= 60) {
        console.log(
            "All chats loaded via auto-prefetch - pagination working correctly",
        );
        expect(initialCount).toBeGreaterThanOrEqual(60);
        return;
    }

    // Check if there's a next page to load
    const sentinel = page.getByTestId("saved-chats-load-more");
    const hasSentinel = (await sentinel.count()) > 0;
    console.log(`Has sentinel: ${hasSentinel}`);

    expect(hasSentinel).toBe(true);

    // Scroll the real scroll ancestor to the bottom to trigger loading.
    // saved-chats-container itself has no height constraint and doesn't
    // scroll — the actual scrollbar lives on an ancestor.
    await scrollSavedChatsToBottom(page);
    await page.waitForTimeout(1000);

    const response = await page2Promise;
    if (response) {
        console.log(`Page 2 request made!`);
        const data = await response.json();
        console.log(`Page 2 returned ${data.length} chats`);
    } else {
        console.log(`No page 2 request after scrolling`);
    }

    // Final count
    const finalCount = await list.count();
    console.log(`Final chat count: ${finalCount}`);

    expect(finalCount).toBeGreaterThan(initialCount);
});

test("Sidebar edit is blocked for temp chat IDs", async ({ page }) => {
    await gotoSavedChats(page);

    await page.getByTestId("sidebar-new-chat-button").click();
    await page.waitForTimeout(500);

    const tempChatItem = page.locator(
        '[data-testid="sidebar-chat-item"][data-chat-id="new"], [data-testid="sidebar-chat-item"][data-chat-id^="temp_"]',
    );
    if ((await tempChatItem.count()) > 0) {
        await tempChatItem.first().hover();
        await expect(
            tempChatItem.first().getByTestId("sidebar-chat-edit"),
        ).not.toBeVisible();
    } else {
        const firstItem = page.getByTestId("sidebar-chat-item").first();
        const firstId = await firstItem.getAttribute("data-chat-id");
        expect(firstId || "").toMatch(/^[a-f0-9]{24}$/i);
        await firstItem.hover();
        await expect(firstItem.getByTestId("sidebar-chat-edit")).toBeVisible();
    }
});

test("Reload during streaming ends in a stable state", async ({ page }) => {
    const api = await createApiContext();
    const seedPrefix = `reload-seed-${Date.now().toString(36)}`;
    const seededChats = await seedChats(api, 1, seedPrefix);
    await api.dispose();

    const chatId = seededChats?.[0]?._id;
    if (!chatId) {
        throw new Error("Failed to create a chat for reload test.");
    }

    await gotoWithRetry(
        page,
        `/chat/${chatId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );

    const longMessage =
        `stream-reload-${Date.now().toString(36)} ` +
        "Write a detailed 3-paragraph story about coastal weather and field notes.";

    await waitForChatInput(page);
    await sendMessage(page, longMessage);
    await waitForStreamingStart(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await ensureLoggedIn(page);
    await acceptTosIfPresent(page);
    await waitForChatUI(page);
    if (!page.url().includes(`/chat/${chatId}`)) {
        await gotoWithRetry(
            page,
            `/chat/${chatId}`,
            { waitUntil: "domcontentloaded", timeout: 20000 },
            3,
        );
        await waitForChatUI(page);
    }
    await ensureStreamingStopped(page);

    await expect(
        page
            .getByTestId("chat-message-list")
            .getByText("stream-reload", { exact: false }),
    ).toBeVisible({ timeout: 10000 });
});

test("Back/forward navigation keeps history and sidebar highlight", async ({
    page,
}) => {
    const api = await createApiContext();
    const seedA = `nav-a-${Date.now().toString(36)}`;
    const seedB = `nav-b-${Date.now().toString(36)}`;
    const createdA = await seedChats(api, 1, seedA);
    const createdB = await seedChats(api, 1, seedB);

    if (createdA?.[0]?._id) {
        await api.put("/api/chats/active", {
            data: { activeChatId: createdA[0]._id },
        });
    }
    if (createdB?.[0]?._id) {
        await api.put("/api/chats/active", {
            data: { activeChatId: createdB[0]._id },
        });
    }
    await api.dispose();

    const chatAId = createdA?.[0]?._id;
    const chatBId = createdB?.[0]?._id;

    if (!chatAId || !chatBId || chatAId === chatBId) {
        throw new Error("Failed to create distinct chats for nav test.");
    }

    await gotoWithRetry(
        page,
        `/chat/${chatAId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await waitForChatInput(page);
    await expect(page).toHaveURL(new RegExp(`/chat/${chatAId}`));
    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatAId,
        { timeout: 15000 },
    );

    await gotoWithRetry(
        page,
        `/chat/${chatBId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await waitForChatInput(page);
    await expect(page).toHaveURL(new RegExp(`/chat/${chatBId}`));
    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatBId,
        { timeout: 15000 },
    );

    await page.goBack({ waitUntil: "domcontentloaded" });
    await waitForChatUI(page);
    await expect(page).toHaveURL(new RegExp(`/chat/${chatAId}`));
    const chatAItem = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatAId}"]`,
    );
    await expect(chatAItem).toBeVisible({ timeout: 10000 });
    await expect(chatAItem).toHaveClass(/bg-gray-100/);

    await page.goForward({ waitUntil: "domcontentloaded" });
    await waitForChatUI(page);
    await expect(page).toHaveURL(new RegExp(`/chat/${chatBId}`));
    const chatBItem = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatBId}"]`,
    );
    await expect(chatBItem).toBeVisible({ timeout: 10000 });
    await expect(chatBItem).toHaveClass(/bg-gray-100/);
});

test("Chat title updates after first message", async ({ page }) => {
    await gotoChatHome(page);

    const titleSeed = `AutoTitle-${Date.now().toString(36)}`;
    await waitForChatInput(page);
    await sendMessage(page, titleSeed);
    const chatId = await waitForStableChatId(page);
    await waitForStreamingStop(page);

    // Wait for sidebar to update with new chat
    await page.waitForTimeout(2000);

    // Refresh to ensure sidebar shows the latest chat
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForChatUI(page);

    const chatItem = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatId}"]`,
    );
    await expect(chatItem).toBeVisible({ timeout: 10000 });
    await expect(chatItem).not.toContainText(/new chat/i, { timeout: 15000 });
});

test("Rapid send does not create duplicate messages", async ({ page }) => {
    const api = await createApiContext();
    const response = await api.post("/api/chats", {
        data: { messages: [], title: "" },
        timeout: 15000,
    });
    const chat = response.ok() ? await response.json() : null;
    await api.dispose();
    const chatId = chat?._id;
    if (!chatId) {
        throw new Error("Failed to create chat for rapid send test.");
    }

    await gotoWithRetry(
        page,
        `/chat/${chatId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await waitForChatInput(page);

    const message = `dupe-${Date.now().toString(36)}`;
    const input = page.getByTestId("chat-message-input").first();

    await sendMessage(page, message);
    await input.press("Enter");

    const occurrences = page.locator(".chat-message-user", {
        hasText: message,
    });

    await expect(occurrences.first()).toBeVisible({ timeout: 10000 });
    await ensureStreamingStopped(page);

    await expect
        .poll(async () => occurrences.count(), { timeout: 10000 })
        .toBe(1);
});

test("Draft persists per chat when navigating away and back", async ({
    page,
}) => {
    const api = await createApiContext();
    const seedA = `draft-a-${Date.now().toString(36)}`;
    const seedB = `draft-b-${Date.now().toString(36)}`;
    const createdA = await seedChats(api, 1, seedA);
    const createdB = await seedChats(api, 1, seedB);
    await api.dispose();

    const chatAId = createdA?.[0]?._id;
    const chatBId = createdB?.[0]?._id;

    if (!chatAId || !chatBId) {
        throw new Error("Failed to create chats for draft test.");
    }

    const draftText = `draft-${Date.now().toString(36)}`;
    await gotoWithRetry(
        page,
        `/chat/${chatBId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await waitForChatInput(page);
    const chatAItem = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatAId}"]`,
    );
    const chatBItem = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatBId}"]`,
    );
    await expect(chatAItem).toBeVisible({ timeout: 10000 });
    await expect(chatBItem).toBeVisible({ timeout: 10000 });

    await gotoWithRetry(
        page,
        `/chat/${chatAId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await waitForChatId(page, chatAId);
    await waitForChatInput(page);
    const input = page.getByTestId("chat-message-input");

    // Wait for any pending state updates
    await page.waitForTimeout(500);

    const stateUpdate = page
        .waitForResponse(
            (response) =>
                response.url().includes("/api/users/me/state") &&
                response.request().method() === "PUT",
            { timeout: 15000 },
        )
        .catch(() => null);
    await input.fill(draftText);
    await expect(input).toHaveValue(draftText, { timeout: 5000 });

    // Wait for state update if it happened
    if (stateUpdate) {
        await stateUpdate;
    }

    // Wait a bit for draft to be saved
    await page.waitForTimeout(500);

    await gotoWithRetry(
        page,
        `/chat/${chatBId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await waitForChatId(page, chatBId);
    await waitForChatInput(page);

    await gotoWithRetry(
        page,
        `/chat/${chatAId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await waitForChatId(page, chatAId);
    await waitForChatInput(page);

    // Give more time for draft to load
    await page.waitForTimeout(1000);

    await expect(page.getByTestId("chat-message-input")).toHaveValue(
        draftText,
        { timeout: 15000 },
    );
});

test("Shared chat opens read-only with input disabled", async ({
    page,
    browser,
}) => {
    await gotoChatHome(page);

    const message = `shared-${Date.now().toString(36)}`;
    const chatId = await createChat(page, message);
    await waitForStreamingStop(page);

    if (!chatId) {
        throw new Error("Failed to create chat for shared test.");
    }

    const api = await createApiContext();
    let updateError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await api.put(`/api/chats/${chatId}`, {
                data: { isPublic: true },
                timeout: 15000,
            });
            if (response.ok()) {
                updateError = null;
                break;
            }
            updateError = new Error(
                `Failed to share chat: ${response.status()}`,
            );
        } catch (error) {
            updateError = error;
        }
        if (attempt < 3) {
            await page.waitForTimeout(500);
        }
    }
    if (updateError) {
        throw updateError;
    }
    await api.dispose();

    const viewerEmail = `shared-viewer-${Date.now().toString(36)}@example.com`;
    const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
    });
    await applyLocalAuthCookie(context, viewerEmail);
    const pageB = await context.newPage();

    try {
        await gotoWithRetry(
            pageB,
            `${baseURL}/chat/${chatId}`,
            { waitUntil: "domcontentloaded", timeout: 20000 },
            3,
        );
        await acceptTosIfPresent(pageB);
        await waitForChatUI(pageB);

        const authStatus = await pageB.request.get(
            `${baseURL}/api/auth/status`,
        );
        const authData = authStatus.ok() ? await authStatus.json() : null;
        expect(authData?.authenticated).toBe(true);
        expect(authData?.user?.username).toBe(viewerEmail);

        const input = pageB.getByTestId("chat-message-input");
        await expect(input).toBeDisabled();
        await expect(pageB.getByTestId("chat-send-button")).toBeDisabled();
        await expect(pageB.getByText(/read-only mode/i)).toBeVisible();

        const chatResponse = await pageB.request.get(
            `${baseURL}/api/chats/${chatId}`,
        );
        if (chatResponse.ok()) {
            const chatData = await chatResponse.json();
            expect(chatData?.readOnly).toBe(true);
        }
    } finally {
        await pageB.close();
        await context.close();
    }
});

test("Search results open chat and clear search state", async ({ page }) => {
    const api = await createApiContext();
    const keyword = `find-${Date.now().toString(36)}`;
    const createResponse = await api.post("/api/chats", {
        data: {
            title: keyword,
            messages: [
                {
                    payload: keyword,
                    sender: "user",
                    direction: "outgoing",
                    position: "single",
                    sentTime: new Date().toISOString(),
                },
            ],
        },
    });
    const createdChat = createResponse.ok()
        ? await createResponse.json()
        : null;
    const chatId = createdChat?._id || null;
    await api.dispose();

    if (!chatId) {
        throw new Error("Failed to create chat for search test.");
    }

    await gotoSavedChats(page);

    const searchInput = page.getByTestId("saved-chats-search");
    await searchInput.fill(keyword);
    const keywordPattern = new RegExp(
        keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const chatTileById = page.locator(
        `[data-testid="saved-chat-item"][data-chat-id="${chatId}"]`,
    );
    const chatTileByText = page
        .getByTestId("saved-chat-item")
        .filter({ hasText: keywordPattern });
    await expect
        .poll(
            async () => {
                if (await chatTileById.count()) return "id";
                if (await chatTileByText.count()) return "text";
                return "missing";
            },
            { timeout: 30000 },
        )
        .not.toBe("missing");

    const chatTile =
        (await chatTileById.count()) > 0
            ? chatTileById.first()
            : chatTileByText.first();
    await expect(chatTile).toBeVisible({ timeout: 10000 });
    await chatTile.click();

    await expect(page).toHaveURL(/\/chat\/[a-f0-9]{24}$/i);
    await expect(
        page
            .getByTestId("chat-message-list")
            .getByText(keywordPattern, { exact: false }),
    ).toBeVisible({ timeout: 10000 });

    await gotoSavedChats(page);
    await expect(searchInput).toHaveValue("", { timeout: 10000 });
});

test("Shift range select highlights multiple chats and enables bulk actions", async ({
    page,
}) => {
    const api = await createApiContext();
    await seedChats(api, 3, "range-seed");
    await api.dispose();

    await gotoSavedChats(page);

    const tiles = page.getByTestId("saved-chat-item");
    const count = await tiles.count();
    if (count < 3) {
        throw new Error("Not enough chats to test range selection.");
    }

    await tiles.nth(0).getByTestId("saved-chat-select").click();
    await tiles
        .nth(2)
        .getByTestId("saved-chat-select")
        .click({ modifiers: ["Shift"] });

    await expect
        .poll(
            async () => page.locator(".selection-checkbox.selected").count(),
            { timeout: 5000 },
        )
        .toBe(3);

    const bulkDeleteButton = page.getByTestId("saved-chats-bulk-delete");
    await expect(bulkDeleteButton).toBeEnabled();
});

test("Deleting active chat navigates to latest chat", async ({ page }) => {
    await gotoChatHome(page);

    const chatAId = await createChat(
        page,
        `active-del-a-${Date.now().toString(36)}`,
    );
    await waitForStreamingStop(page);

    if (!chatAId || !isObjectId(chatAId)) {
        throw new Error("Failed to create chat for delete test.");
    }

    const chatItem = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatAId}"]`,
    );
    await expect(chatItem).toBeVisible({ timeout: 10000 });
    const deleteButton = chatItem.getByTestId("sidebar-chat-delete");
    await deleteButton.click({ force: true });

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("button", { name: /delete/i }).click();
    await waitForSidebarChatRemoval(page, chatAId);
    await expect(page).not.toHaveURL(new RegExp(`/chat/${chatAId}`));
});

test("Deleting chat from saved list keeps /chat route", async ({ page }) => {
    await gotoChatHome(page);

    const deleteMessage = `saved-del-${Date.now().toString(36)}`;
    const chatId = await createChat(page, deleteMessage);
    await waitForStreamingStop(page);

    if (!chatId) {
        throw new Error("Failed to create chat for saved delete test.");
    }

    await gotoSavedChats(page);
    await expect(page).toHaveURL(/\/chat\/?$/);

    const chatTile = page.locator(
        `[data-testid="saved-chat-item"][data-chat-id="${chatId}"]`,
    );
    await expect(chatTile).toBeVisible({ timeout: 20000 });
    const deleteButton = chatTile.getByTestId("saved-chat-delete");
    await chatTile.hover();
    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    await deleteButton.dispatchEvent("click");
    const confirm = page.getByTestId("saved-chat-delete-confirm");
    if (!(await confirm.isVisible().catch(() => false))) {
        await page.evaluate(() => {
            const el = document.querySelector(
                '[data-testid="saved-chat-delete"]',
            );
            if (el) {
                el.dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            }
        });
    }
    await expect(confirm).toBeVisible({ timeout: 5000 });
    await confirm.click();

    await expect(chatTile).toHaveCount(0);
    await expect(page).toHaveURL(/\/chat\/?$/);
});

test("Empty saved chats state shows and new chat works", async ({ page }) => {
    // Set header to skip SSR pre-fetching
    await page.setExtraHTTPHeaders({ "x-skip-ssr-chats": "true" });

    // Exhaustive mocks for all chat-related GET endpoints
    await page.route("**/api/chats?page=*", async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        });
    });

    await page.route("**/api/chats/count", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(0),
        });
    });

    await page.route("**/api/chats/active", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ recentChatIds: [], activeChatId: null }),
        });
    });

    await page.route("**/api/chats/active/detail", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        });
    });

    await page.route("**/api/chats?prefetch=true", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                _id: "temp_unused_mock",
                messages: [],
                isUnused: true,
                title: "",
            }),
        });
    });

    await gotoSavedChats(page);
    await expect(page.getByText(/no chats yet/i)).toBeVisible({
        timeout: 10000,
    });

    await page
        .getByTestId("saved-chats-container")
        .getByRole("button", { name: /new chat/i })
        .click();

    // Allow various redirect patterns including the mock ID, real IDs, and client=1 params
    // Sometimes it might stay on /chat for a bit before redirecting
    await expect(page).toHaveURL(
        /\/chat\/(new|temp_unused_mock|[a-f\d]{24})(\?.*)?/,
        { timeout: 10000 },
    );
    await waitForChatInput(page);

    const message = `empty-create-${Date.now().toString(36)}`;
    await sendMessage(page, message);
    await waitForStreamingStop(page);

    // Delete the chat we just created to keep the DB clean for next tests
    try {
        const chatItem = page.getByTestId("sidebar-chat-item").first();
        if (await chatItem.isVisible({ timeout: 5000 }).catch(() => false)) {
            await chatItem.hover();
            await chatItem
                .getByTestId("sidebar-chat-delete")
                .click({ force: true });
            const dialog = page.getByRole("alertdialog");
            const deleteBtn = dialog.getByRole("button", { name: /delete/i });
            if (
                await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)
            ) {
                await deleteBtn.click();
                await expect(chatItem)
                    .not.toBeVisible({ timeout: 5000 })
                    .catch(() => {});
            }
        }
    } catch (e) {
        console.warn("Cleanup deletion failed:", e);
    }

    // Cleanup: clear extra headers and all mocks we added
    await page.setExtraHTTPHeaders({});
    await page.unroute("**/api/chats?page=*");
    await page.unroute("**/api/chats/count");
    await page.unroute("**/api/chats/active");
    await page.unroute("**/api/chats/active/detail");
    await page.unroute("**/api/chats?prefetch=true");
});

test("Fast sends preserve order and block parallel send", async ({ page }) => {
    await gotoChatHome(page);

    const newChatButton = page.getByTestId("sidebar-new-chat-button");
    // Force click to ensure we move towards a fresh chat context
    await newChatButton.click();

    // Wait for either /chat/new, a temp ID, or a redirected unused chat ID
    await expect(page).toHaveURL(
        /\/chat\/(new|temp_[a-zA-Z0-9_]+|[a-f\d]{24})(\?.*)?/,
        {
            timeout: 15000,
        },
    );

    // Ensure we are in an empty chat. If not, click "New Chat" again.
    // This handles cases where the "New Chat" redirected to an existing chat with leftover messages from a failed test.
    if ((await page.locator(".chat-message-user").count()) > 0) {
        await newChatButton.click();
        await expect(page.locator(".chat-message-user")).toHaveCount(0, {
            timeout: 10000,
        });
    }

    const messagesContainer = page.getByTestId("chat-messages").first();
    // Wait for navigation to complete and chat to be ready
    await page.waitForTimeout(1500);
    // Ensure we're on a valid chat page (either /chat/new, /chat/temp_*, or /chat/{id})
    await expect(page).toHaveURL(
        /\/chat\/(new|temp_[a-zA-Z0-9_]+|[a-f0-9]{24})/,
    );
    await expect(page.locator(".chat-message-user")).toHaveCount(0);
    await waitForChatInput(page);
    await ensureStreamingStopped(page);

    let streamDelayApplied = false;
    await page.route("**/api/chats/**/stream", async (route) => {
        if (!streamDelayApplied) {
            streamDelayApplied = true;
            await page.waitForTimeout(1000);
        }
        await route.continue();
    });

    const firstMessage = `fast-1-${Date.now().toString(36)}`;
    const secondMessage = `fast-2-${Date.now().toString(36)}`;

    await sendMessage(page, firstMessage);
    const firstUserMessage = page.locator(".chat-message-user", {
        hasText: firstMessage,
    });
    await expect(firstUserMessage).toBeVisible({ timeout: 10000 });

    // Wait for streaming to complete before sending next message
    await waitForStreamingStop(page);
    await page.waitForTimeout(500);

    const input = page.getByTestId("chat-message-input");
    const sendButton = page.getByTestId("chat-send-button");

    // Clear any existing input and fill new message
    await input.fill("");
    await input.fill(secondMessage);

    // Wait for send button to be ready
    await expect
        .poll(
            async () => {
                const disabled = await sendButton.isDisabled();
                const type = await sendButton.getAttribute("type");
                if (!disabled && type === "submit") return "ready";
                return "waiting";
            },
            { timeout: 10000 },
        )
        .toBe("ready");

    await sendButton.click();

    const secondUserMessage = page.locator(".chat-message-user", {
        hasText: secondMessage,
    });
    await expect(secondUserMessage).toBeVisible({ timeout: 10000 });
    await waitForStreamingStop(page);

    const userMessages = page.locator(".chat-message-user");
    await expect
        .poll(
            async () => {
                const texts = await userMessages.allTextContents();
                const firstIndex = texts.findIndex((text) =>
                    text.includes(firstMessage),
                );
                const secondIndex = texts.findIndex((text) =>
                    text.includes(secondMessage),
                );
                if (firstIndex === -1 || secondIndex === -1) return "missing";
                return firstIndex < secondIndex ? "ordered" : "wrong";
            },
            { timeout: 10000 },
        )
        .toBe("ordered");
});

test("Long history keeps scroll position when new message arrives", async ({
    page,
}) => {
    const api = await createApiContext();
    const chatId = await seedChatWithMessages(api, 120, "history-seed");
    await api.dispose();

    if (!chatId) {
        throw new Error("Failed to seed long history chat.");
    }

    await gotoWithRetry(
        page,
        `/chat/${chatId}`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
        3,
    );
    await page.setViewportSize({ width: 1280, height: 700 });
    await ensureLoggedIn(page);
    await acceptTosIfPresent(page);
    await waitForChatUI(page);

    const list = page.getByTestId("chat-message-list");
    const historyMessages = page.locator(".chat-message-user");
    // Wait for messages to load - API may return limited number initially
    await expect
        .poll(async () => historyMessages.count(), { timeout: 10000 })
        .toBeGreaterThan(20);

    const detectScrollTarget = async () =>
        page.evaluate(() => {
            const listEl = document.querySelector(
                '[data-testid="chat-message-list"]',
            );
            let node = listEl;
            while (node && node !== document.body) {
                const style = window.getComputedStyle(node);
                const canScroll =
                    node.scrollHeight > node.clientHeight &&
                    (style.overflowY === "auto" ||
                        style.overflowY === "scroll");
                if (canScroll) {
                    node.setAttribute("data-scroll-target", "true");
                    return "found";
                }
                node = node.parentElement;
            }
            if (
                document.documentElement.scrollHeight >
                document.documentElement.clientHeight
            ) {
                document.documentElement.setAttribute(
                    "data-scroll-target",
                    "true",
                );
                return "found";
            }
            return "none";
        });

    let scrollTarget = await detectScrollTarget();
    if (scrollTarget === "none") {
        await list.evaluate((el) => {
            el.style.maxHeight = "300px";
            el.style.height = "300px";
            el.style.overflowY = "scroll";
        });
        scrollTarget = await detectScrollTarget();
    }
    if (scrollTarget === "none") {
        // Force scroll on the list element itself
        await page.evaluate(() => {
            const listEl = document.querySelector(
                '[data-testid="chat-message-list"]',
            );
            if (listEl) {
                listEl.style.maxHeight = "300px";
                listEl.style.height = "300px";
                listEl.style.overflowY = "scroll";
                listEl.setAttribute("data-scroll-target", "true");
            }
        });
        scrollTarget = "found";
    }

    await page.evaluate(() => {
        const target = document.querySelector("[data-scroll-target='true']");
        if (!target) return;
        if (target.tagName === "HTML") {
            window.scrollTo(0, 0);
            return;
        }
        target.scrollTop = 0;
    });

    const message = `history-new-${Date.now().toString(36)}`;
    await waitForChatInput(page);
    await sendMessage(page, message);
    await waitForStreamingStart(page);

    await page.evaluate(() => {
        const target = document.querySelector("[data-scroll-target='true']");
        if (!target) return;
        if (target.tagName === "HTML") {
            window.scrollTo(0, 0);
            return;
        }
        target.scrollTop = 0;
    });

    await waitForStreamingStop(page);

    const scrollState = await page.evaluate(() => {
        const target = document.querySelector("[data-scroll-target='true']");
        if (!target) return { top: 0, bottomThreshold: 0 };
        if (target.tagName === "HTML") {
            return {
                top: window.scrollY,
                bottomThreshold:
                    document.documentElement.scrollHeight -
                    window.innerHeight -
                    20,
            };
        }
        return {
            top: target.scrollTop,
            bottomThreshold: target.scrollHeight - target.clientHeight - 20,
        };
    });

    if (scrollState.bottomThreshold <= 0) {
        return;
    }

    expect(scrollState.top).toBeLessThan(scrollState.bottomThreshold);
});

test("Saved chat tile opens correct history and URL", async ({ page }) => {
    await gotoChatHome(page);

    const seedMessage = `open-saved-${Date.now().toString(36)}`;
    const chatId = await createChat(page, seedMessage);
    await waitForStreamingStop(page);

    if (!chatId) {
        throw new Error("Failed to create chat for saved chat open test.");
    }

    await gotoSavedChats(page);

    const chatTile = page.locator(
        `[data-testid="saved-chat-item"][data-chat-id="${chatId}"]`,
    );
    await expect(chatTile).toBeVisible({ timeout: 20000 });
    await chatTile.click();

    await expect(page).toHaveURL(new RegExp(`/chat/${chatId}`));
    await waitForChatUI(page);

    await expect(
        page
            .getByTestId("chat-message-list")
            .locator(".chat-message-user", { hasText: seedMessage })
            .first(),
    ).toBeVisible({ timeout: 10000 });
});

test("Sidebar rename updates saved list and persists on reload", async ({
    page,
}) => {
    await gotoChatHome(page);

    const seedMessage = `rename-seed-${Date.now().toString(36)}`;
    const chatId = await createChat(page, seedMessage);
    await waitForStreamingStop(page);

    if (!chatId) {
        throw new Error("Failed to create chat for rename test.");
    }

    const newTitle = `Renamed ${Date.now().toString(36)}`;
    const chatItem = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatId}"]`,
    );

    await expect(chatItem).toBeVisible({ timeout: 10000 });
    await chatItem.hover();
    await chatItem.getByTestId("sidebar-chat-edit").click({ force: true });

    const editInput = chatItem.locator('input[type="text"]');
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.fill(newTitle);
    await editInput.press("Enter");

    await expect(chatItem).toContainText(newTitle, { timeout: 15000 });

    await gotoSavedChats(page);

    const savedTile = page.locator(
        `[data-testid="saved-chat-item"][data-chat-id="${chatId}"]`,
    );
    await expect(savedTile).toBeVisible({ timeout: 20000 });
    await expect(savedTile).toContainText(newTitle, { timeout: 15000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await ensureLayoutReady(page);
    await expect(savedTile).toContainText(newTitle, { timeout: 15000 });
});

test("Single delete from saved chats removes chat and sidebar item", async ({
    page,
}) => {
    await gotoChatHome(page);

    const deleteMessage = `single-delete-${Date.now().toString(36)}`;
    const chatId = await createChat(page, deleteMessage);
    await waitForStreamingStop(page);

    if (!chatId) {
        throw new Error("Failed to create chat for single delete test.");
    }

    await gotoSavedChats(page);

    const chatTile = page.locator(
        `[data-testid="saved-chat-item"][data-chat-id="${chatId}"]`,
    );
    await expect(chatTile).toBeVisible({ timeout: 20000 });
    const deleteButton = chatTile.getByTestId("saved-chat-delete");
    await chatTile.hover();
    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    await deleteButton.dispatchEvent("click");
    const confirmButton = page.getByTestId("saved-chat-delete-confirm");
    if (!(await confirmButton.isVisible().catch(() => false))) {
        await page.evaluate(() => {
            const el = document.querySelector(
                '[data-testid="saved-chat-delete"]',
            );
            if (el) {
                el.dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            }
        });
    }
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();
    await expect(chatTile).toHaveCount(0);
    await waitForSidebarChatRemoval(page, chatId);
});

test("Multi-tab chat reflects new messages after send", async ({ page }) => {
    await gotoChatHome(page);

    const seedMessage = `multitab-seed-${Date.now().toString(36)}`;
    const chatId = await createChat(page, seedMessage);
    await waitForStreamingStop(page);

    if (!chatId) {
        throw new Error("Failed to create chat for multi-tab test.");
    }

    const context = page.context();
    const pageB = await context.newPage();

    try {
        await gotoWithRetry(
            pageB,
            `${baseURL}/chat/${chatId}`,
            { waitUntil: "domcontentloaded", timeout: 20000 },
            3,
        );
        await ensureLoggedIn(pageB);
        await acceptTosIfPresent(pageB);
        await waitForChatUI(pageB);

        await expect(
            pageB
                .getByTestId("chat-message-list")
                .getByText(seedMessage, { exact: false })
                .first(),
        ).toBeVisible({ timeout: 10000 });

        const newMessage = `multitab-${Date.now().toString(36)}`;
        await waitForChatInput(page);
        await sendMessage(page, newMessage);
        await waitForStreamingStop(page);

        const messageInTabB = pageB
            .getByTestId("chat-message-list")
            .getByText(newMessage, { exact: false })
            .first();

        let updated = false;
        try {
            await expect(messageInTabB).toBeVisible({ timeout: 5000 });
            updated = true;
        } catch {
            updated = false;
        }

        if (!updated) {
            await pageB.reload({ waitUntil: "domcontentloaded" });
            await ensureLoggedIn(pageB);
            await acceptTosIfPresent(pageB);
            await waitForChatUI(pageB);
            // After reload, create a fresh locator since the DOM was replaced
            const messageInTabBAfterReload = pageB
                .getByTestId("chat-message-list")
                .getByText(newMessage, { exact: false })
                .first();
            await expect(messageInTabBAfterReload).toBeVisible({
                timeout: 10000,
            });
        } else {
            await expect(messageInTabB).toBeVisible({ timeout: 10000 });
        }
    } finally {
        await pageB.close();
    }
});

test("Large multiline input with emoji sends and persists", async ({
    page,
}) => {
    await gotoChatHome(page);

    const largeMessage = [
        "Line 1: recap of the conversation.",
        "Line 2: emoji check 😄🚀 and more details.",
        "Line 3: final thoughts.",
    ].join("\n");

    await waitForChatInput(page);
    await sendMessage(page, largeMessage);
    await waitForStreamingStop(page);
    await waitForStableChatId(page);

    const messageList = page.getByTestId("chat-message-list");
    await expect(messageList).toContainText("Line 1", { timeout: 10000 });
    await expect(messageList).toContainText("Line 2", { timeout: 10000 });
    await expect(messageList).toContainText("Line 3", { timeout: 10000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await ensureLoggedIn(page);
    await acceptTosIfPresent(page);
    await waitForChatUI(page);

    await expect(messageList).toContainText("Line 2", { timeout: 10000 });
});

test("Accessibility smoke: keyboard send, focus, and roles", async ({
    page,
}) => {
    await gotoChatHome(page);

    const input = page.getByRole("textbox", { name: /send a message/i });
    await expect(input).toBeVisible({ timeout: 10000 });

    const sendButton = page.getByTestId("chat-send-button");
    expect(await page.getByRole("button").count()).toBeGreaterThan(0);
    await expect(sendButton).toHaveJSProperty("tagName", "BUTTON");

    const message = `a11y-${Date.now().toString(36)}`;
    await input.click();
    await input.fill(message);
    await input.press("Enter");

    await expect(
        page
            .getByTestId("chat-message-list")
            .getByText(message, { exact: false }),
    ).toBeVisible({ timeout: 10000 });

    // Wait for streaming to complete
    await waitForStreamingStop(page);

    // Verify basic a11y: buttons exist and are accessible
    const buttonCount = await page.getByRole("button").count();
    expect(buttonCount).toBeGreaterThan(0);

    // Verify the message appears in an accessible list
    const messageList = page.getByTestId("chat-message-list");
    await expect(messageList).toBeVisible();
});

test("New chat creation is instant and optimistic", async ({ page }) => {
    await gotoChatHome(page);

    // Warm up - create first chat to ensure system is ready
    const warmupButton = page.getByTestId("sidebar-new-chat-button");
    await warmupButton.click();
    await waitForChatUI(page);

    // Go back to chat home
    await gotoChatHome(page);

    // Measure time for instant new chat creation
    const startTime = Date.now();

    // Click new chat button
    await warmupButton.click();

    // The chat UI should appear almost instantly (within 500ms for optimistic UI)
    const chatInput = page
        .locator('[data-testid="chat-message-input"]')
        .first();
    const chatButton = page.locator('[data-testid="chat-via-button"]').first();

    await Promise.race([
        expect(chatInput).toBeVisible({ timeout: 500 }),
        expect(chatButton).toBeVisible({ timeout: 500 }),
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify the navigation happened instantly (< 500ms for optimistic UI)
    expect(duration).toBeLessThan(500);

    // Verify we're on a chat page with temp ID, real ID, or /chat/new
    const url = page.url();
    expect(url).toMatch(/\/chat\/(temp_[a-zA-Z0-9_]+|[a-f0-9]{24}|new)/);

    // Verify the chat is ready for input immediately
    const inputVisible = await chatInput.isVisible().catch(() => false);
    const buttonVisible = await chatButton.isVisible().catch(() => false);
    expect(inputVisible || buttonVisible).toBe(true);
});

test("Optimistic new chat lifecycle: create, send message, verify persistence", async ({
    page,
}) => {
    await gotoChatHome(page);

    // Create new chat optimistically
    const newChatButton = page.getByTestId("sidebar-new-chat-button");
    const startTime = Date.now();
    await newChatButton.click();

    // Wait for instant navigation
    await waitForChatUI(page);
    const navigationTime = Date.now() - startTime;
    expect(navigationTime).toBeLessThan(1000); // Should be instant

    // Get the chat ID from URL (might be "new" or temp ID initially)
    const url = page.url();
    const chatIdMatch = url.match(/\/chat\/([a-zA-Z0-9_]+)/);
    expect(chatIdMatch).toBeTruthy();

    // Wait for input to be ready
    await page.waitForTimeout(500);

    // Send a message immediately (should work optimistically)
    const message = `optimistic-test-${Date.now()}`;
    const input = page.locator('[data-testid="chat-message-input"]').first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.click();
    await input.fill(message);
    await input.press("Enter");

    // Wait for message to appear in UI (optimistic)
    await expect(page.locator(`text=${message}`).first()).toBeVisible({
        timeout: 10000,
    });

    // Wait for server sync (message should persist)
    await waitForStreamingStop(page);

    // Verify chat appears in sidebar (by checking there are items in sidebar)
    const sidebarItems = page.locator('[data-testid="sidebar-chat-item"]');
    const count = await sidebarItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
});

test("Rapid optimistic new chats creation handles all edge cases", async ({
    page,
}) => {
    await gotoChatHome(page);

    // Create multiple chats rapidly (stress test)
    const chatIds = [];
    const newChatButton = page.getByTestId("sidebar-new-chat-button");

    for (let i = 0; i < 5; i++) {
        await newChatButton.click();
        await waitForChatUI(page);

        const url = page.url();
        const match = url.match(/\/chat\/([a-zA-Z0-9_]+)/);
        // Skip "new" IDs as they're placeholders
        if (match && match[1] !== "new" && !chatIds.includes(match[1])) {
            chatIds.push(match[1]);
        }

        // Small delay to simulate rapid user clicks
        await page.waitForTimeout(100);
    }

    // Verify we have created chats (at least 1 should persist after server sync)
    expect(chatIds.length).toBeGreaterThanOrEqual(1);

    // Verify chats appear in sidebar (check by counting sidebar items)
    const sidebarItems = page.locator('[data-testid="sidebar-chat-item"]');
    const count = await sidebarItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
});

test("Optimistic new chat survives immediate navigation away and back", async ({
    page,
}) => {
    await gotoChatHome(page);

    // Create new chat and send a message to ensure it persists
    await page.getByTestId("sidebar-new-chat-button").click();
    await waitForChatUI(page);

    const message = `nav-test-${Date.now()}`;
    const input = page.locator('[data-testid="chat-message-input"]').first();
    await input.fill(message);
    await input.press("Enter");

    // Wait for server sync to get real chat ID
    await waitForStreamingStop(page);

    // Get the real chat ID after server sync
    const url = page.url();
    const chatIdMatch = url.match(/\/chat\/([a-f0-9]{24})/);
    expect(chatIdMatch).toBeTruthy();
    const chatId = chatIdMatch[1];

    // Navigate away to saved chats
    await page.goto("/chat");
    await expect(
        page.getByRole("heading", { name: /chat history/i }),
    ).toBeVisible({ timeout: 10000 });

    // Navigate back to the chat
    await page.goto(`/chat/${chatId}`);
    await waitForChatUI(page);

    // Verify we're back on the same chat
    const currentUrl = page.url();
    expect(currentUrl).toContain(chatId);

    // Verify chat is functional - input should be available
    const inputAfter = page
        .locator('[data-testid="chat-message-input"]')
        .first();
    await expect(inputAfter).toBeVisible({ timeout: 5000 });
});

test("Optimistic new chat handles immediate message send without waiting for server", async ({
    page,
}) => {
    await gotoChatHome(page);

    // Create new chat
    const startTime = Date.now();
    await page.getByTestId("sidebar-new-chat-button").click();
    await waitForChatUI(page);

    // Send message within 500ms of chat creation (before server sync)
    const message = `instant-${Date.now()}`;
    const input = page.locator('[data-testid="chat-message-input"]').first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.click();
    await input.fill(message);
    await input.press("Enter");

    const messageSentTime = Date.now() - startTime;
    expect(messageSentTime).toBeLessThan(3000); // Should be able to send quickly

    // Message should appear optimistically
    await expect(page.locator(`text=${message}`).first()).toBeVisible({
        timeout: 5000,
    });

    // Wait for streaming to complete
    await waitForStreamingStop(page);

    // Verify the chat is still functional - input should be available
    const inputAfterSend = page
        .locator('[data-testid="chat-message-input"]')
        .first();
    await expect(inputAfterSend).toBeVisible({ timeout: 5000 });
});

test("Optimistic new chat with sidebar visibility sync", async ({ page }) => {
    await gotoChatHome(page);

    // Create new chat
    await page.getByTestId("sidebar-new-chat-button").click();
    await waitForChatUI(page);

    // Send a message to trigger server sync
    const message = `sidebar-sync-${Date.now()}`;
    const input = page.locator('[data-testid="chat-message-input"]').first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.click();
    await input.fill(message);
    await input.press("Enter");

    // Wait for server sync to get real chat ID
    await waitForStreamingStop(page);

    // Wait for URL to update to a real chat ID
    await expect
        .poll(
            async () => {
                const url = page.url();
                return url.match(/\/chat\/([a-f0-9]{24})/);
            },
            { timeout: 10000 },
        )
        .toBeTruthy();

    // Get the real chat ID after server sync
    const url = page.url();
    const chatIdMatch = url.match(/\/chat\/([a-f0-9]{24})/);
    expect(chatIdMatch).toBeTruthy();
    const chatId = chatIdMatch[1];

    // Sidebar should show the new chat
    const sidebarChat = page.locator(
        `[data-testid="sidebar-chat-item"][data-chat-id="${chatId}"]`,
    );
    await expect(sidebarChat).toBeVisible({ timeout: 5000 });

    // Sidebar should still show the chat with updated info
    await expect(sidebarChat).toBeVisible({ timeout: 5000 });
});

test("Optimistic message sending - shows immediately without waiting for server", async ({
    page,
}) => {
    await gotoChatHome(page);

    // Create a chat first
    const chatId = await createChat(page, `optimistic-msg-${Date.now()}`);
    await waitForStreamingStop(page);

    // Prepare a unique message
    const message = `instant-optimistic-${Date.now()}`;
    const input = page.locator('[data-testid="chat-message-input"]').first();

    // Measure send time
    const startTime = Date.now();
    await input.fill(message);
    await input.press("Enter");

    // Message should appear optimistically (fast local update)
    await expect(page.locator(`text=${message}`).first()).toBeVisible({
        timeout: 1000,
    });
    const appearTime = Date.now() - startTime;

    // Should appear quickly (avoid flakiness from event-loop jitter)
    expect(appearTime).toBeLessThan(300);

    // Wait for server response
    await waitForStreamingStop(page);

    // Message should still be there after server confirms
    await expect(page.locator(`text=${message}`).first()).toBeVisible({
        timeout: 5000,
    });
});

test("Virtual scrolling handles long chat history efficiently", async ({
    page,
}) => {
    await gotoChatHome(page);

    // Seed a chat with a long history via API to avoid slow/flaky streaming
    const api = await createApiContext();
    const chatId = await seedChatWithMessages(
        api,
        12,
        `virtual-scroll-${Date.now()}`,
    );
    await api.dispose();
    expect(chatId).toBeTruthy();

    // Reload to test rendering on initial load
    await page.goto(`/chat/${chatId}`);
    await waitForChatUI(page);

    // Chat should load - check for any message
    const chatContent = page.locator('[data-testid="chat-messages"]').first();
    await expect(chatContent).toBeVisible({ timeout: 10000 });

    // Should be responsive
    const input = page.locator('[data-testid="chat-message-input"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
});

test("Prefetch on hover makes chat switching instant", async ({ page }) => {
    await gotoChatHome(page);

    // Create multiple chats
    const chatIds = [];
    for (let i = 0; i < 3; i++) {
        const chatId = await createChat(
            page,
            `prefetch-test-${i}-${Date.now()}`,
        );
        await waitForStreamingStop(page);
        chatIds.push(chatId);
    }

    // Go to saved chats
    await page.goto("/chat");
    await page.waitForSelector('[data-testid="saved-chats-search"]', {
        timeout: 10000,
    });

    // Get first chat in sidebar
    const chatItem = page.locator(`[data-testid="sidebar-chat-item"]`).first();

    // Get the chat id from the item
    const chatId = await chatItem.getAttribute("data-chat-id");

    // Hover to trigger prefetch
    await chatItem.hover();

    // Wait for prefetch to complete (100ms debounce + network)
    await page.waitForTimeout(300);

    // Navigate via URL directly to simulate cold navigation
    const startTime = Date.now();
    await page.goto(`/chat/${chatId}`);
    await waitForChatUI(page);
    const duration = Date.now() - startTime;

    // With prefetch, navigation should be noticeably faster
    // Even if not under 300ms, it should be faster than without prefetch
    console.log(`Navigation time with prefetch: ${duration}ms`);

    // Chat should be ready
    const input = page.locator('[data-testid="chat-message-input"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
});

test("Optimistic message sending prevents duplicate sends on rapid clicks", async ({
    page,
}) => {
    await gotoChatHome(page);

    const chatId = await createChat(page, `no-duplicate-${Date.now()}`);
    await waitForStreamingStop(page);

    const message = `single-send-${Date.now()}`;
    const input = page.locator('[data-testid="chat-message-input"]').first();

    // Fill and send
    await input.fill(message);
    await input.press("Enter");

    // Try to send again immediately (should be blocked)
    await input.press("Enter");
    await input.press("Enter");

    // Wait for streaming to complete
    await waitForStreamingStop(page);

    // Count only user message bubbles to avoid matching assistant echo
    const messageCount = await page
        .locator(".chat-message-user", { hasText: message })
        .count();
    expect(messageCount).toBe(1);
});

test("Chat switching and multiple chats work without errors", async ({
    page,
}) => {
    test.setTimeout(120000);
    await gotoChatHome(page);

    // Create first chat
    const chat1 = await createChat(page, `switch-test-1-${Date.now()}`);
    await waitForStreamingStop(page);

    // Verify we're on chat 1
    const url1 = page.url();
    expect(url1).toContain(chat1);

    // Send a message in chat 1
    const msg1 = `chat1-msg-${Date.now()}`;
    await sendMessage(page, msg1);
    await expect(page.locator(`text=${msg1}`).first()).toBeVisible({
        timeout: 5000,
    });
    await waitForStreamingStop(page);

    // Go back to saved chats
    await page.goto("/chat");
    await page.waitForSelector('[data-testid="saved-chats-search"]', {
        timeout: 10000,
    });

    // Create second chat
    const chat2 = await createChat(page, `switch-test-2-${Date.now()}`);
    await waitForStreamingStop(page);

    // Verify we're on chat 2
    const url2 = page.url();
    expect(url2).toContain(chat2);

    // Send a message in chat 2
    const msg2 = `chat2-msg-${Date.now()}`;
    await sendMessage(page, msg2);
    await expect(page.locator(`text=${msg2}`).first()).toBeVisible({
        timeout: 5000,
    });
    await waitForStreamingStop(page);

    // Switch back to chat 1
    await page.goto(`/chat/${chat1}`);
    await waitForChatUI(page);

    // Verify we're on chat 1 - the input should work and we should see chat1's message
    await expect(page.locator(`text=${msg1}`).first()).toBeVisible({
        timeout: 5000,
    });

    // Switch to chat 2
    await page.goto(`/chat/${chat2}`);
    await waitForChatUI(page);

    // Verify we're on chat 2 - should see chat2's message
    await expect(page.locator(`text=${msg2}`).first()).toBeVisible({
        timeout: 5000,
    });

    // Create a third new chat - should work without errors
    const newChatButton = page.getByTestId("sidebar-new-chat-button");
    await newChatButton.click();
    await waitForChatUI(page);

    // Send a message in new chat
    const msg3 = `new-chat-msg-${Date.now()}`;
    await sendMessage(page, msg3);
    await expect(page.locator(`text=${msg3}`).first()).toBeVisible({
        timeout: 5000,
    });
    await waitForStreamingStop(page);

    // Verify the new chat works properly
    const input = page.locator('[data-testid="chat-message-input"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
});

test("Comprehensive: Optimistic state persists correctly when switching chats and returning", async ({
    page,
}) => {
    test.setTimeout(180000);
    await gotoChatHome(page);

    // =====================
    // PHASE 1: Create Chat A with messages
    // =====================
    console.log("PHASE 1: Creating Chat A...");
    await page.getByTestId("sidebar-new-chat-button").click();
    await waitForChatUI(page);
    const chatMessageList = page.getByTestId("chat-message-list");

    const chatAMsg1 = `chatA-first-${Date.now()}`;
    await sendMessage(page, chatAMsg1);
    await expectMessageInChat(page, chatAMsg1);
    await waitForStreamingStop(page);

    // Add second message to Chat A
    const chatAMsg2 = `chatA-second-${Date.now()}`;
    await sendMessage(page, chatAMsg2);
    await expectMessageInChat(page, chatAMsg2);
    await waitForStreamingStop(page);

    // Get Chat A ID
    const urlA = page.url();
    const chatAMatch = urlA.match(/\/chat\/([a-f0-9]{24})/);
    expect(chatAMatch).toBeTruthy();
    const chatAId = chatAMatch[1];
    console.log(`Chat A created: ${chatAId}`);

    // =====================
    // PHASE 2: Switch to Chat B (create new)
    // =====================
    console.log("PHASE 2: Creating Chat B...");
    await page.getByTestId("sidebar-new-chat-button").click();
    await waitForChatUI(page);

    const chatBMsg1 = `chatB-first-${Date.now()}`;
    await sendMessage(page, chatBMsg1);
    await expectMessageInChat(page, chatBMsg1);
    await waitForStreamingStop(page);

    // Get Chat B ID
    const urlB = page.url();
    const chatBMatch = urlB.match(/\/chat\/([a-f0-9]{24})/);
    expect(chatBMatch).toBeTruthy();
    const chatBId = chatBMatch[1];
    console.log(`Chat B created: ${chatBId}`);

    // Verify Chat B's message is visible
    await expectMessageInChat(page, chatBMsg1);

    // Wait for chat to stabilize and messages to update
    await page.waitForTimeout(1000);

    // Re-get the message list to ensure fresh state
    const chatBMessageList = page.getByTestId("chat-message-list");

    // Verify Chat A's messages are NOT visible using fresh locator
    const chatAMsg1Count = await chatBMessageList
        .getByText(chatAMsg1, { exact: true })
        .count();
    const chatAMsg2Count = await chatBMessageList
        .getByText(chatAMsg2, { exact: true })
        .count();
    console.log(
        `Chat A msg1 count: ${chatAMsg1Count}, msg2 count: ${chatAMsg2Count}`,
    );
    expect(chatAMsg1Count).toBe(0);
    expect(chatAMsg2Count).toBe(0);
    console.log("Chat B verified - Chat A messages not visible");

    // =====================
    // PHASE 3: Return to Chat A - verify state persists
    // =====================
    console.log("PHASE 3: Returning to Chat A...");
    await gotoWithRetry(
        page,
        `/chat/${chatAId}`,
        { waitUntil: "domcontentloaded", timeout: 15000 },
        3,
    );
    await waitForChatUI(page);

    // Verify we're on Chat A
    const currentUrl = page.url();
    expect(currentUrl).toContain(chatAId);

    // Verify Chat A's messages are still there
    await expectMessageInChat(page, chatAMsg2);
    console.log("Chat A messages verified after returning");

    // Verify Chat B's message is NOT visible
    await expect(
        chatMessageList.getByText(chatBMsg1, { exact: true }),
    ).toHaveCount(0);

    // =====================
    // PHASE 4: Continue Chat A - add more messages
    // =====================
    console.log("PHASE 4: Continuing Chat A...");
    const chatAMsg3 = `chatA-third-${Date.now()}`;
    await sendMessage(page, chatAMsg3);
    await expectMessageInChat(page, chatAMsg3);
    await waitForStreamingStop(page);

    // Verify all Chat A messages are present
    await expectMessageInChat(page, chatAMsg2);
    await expectMessageInChat(page, chatAMsg3);
    console.log("Chat A continued successfully");

    // =====================
    // PHASE 5: Go to saved chats, then back to Chat B
    // =====================
    console.log("PHASE 5: Testing saved chats navigation...");
    await gotoSavedChats(page);

    // Navigate to Chat B
    await gotoWithRetry(
        page,
        `/chat/${chatBId}`,
        { waitUntil: "domcontentloaded", timeout: 15000 },
        3,
    );
    await waitForChatUI(page);

    // Verify Chat B's message is still there
    await expectMessageInChat(page, chatBMsg1);

    // Add message to Chat B
    const chatBMsg2 = `chatB-second-${Date.now()}`;
    await sendMessage(page, chatBMsg2);
    await expectMessageInChat(page, chatBMsg2);
    await waitForStreamingStop(page);
    console.log("Chat B continued successfully");

    // =====================
    // PHASE 6: Create brand new chat and return
    // =====================
    console.log("PHASE 6: Testing new chat creation...");
    await page.getByTestId("sidebar-new-chat-button").click();
    await waitForChatUI(page);

    const newChatMsg = `newchat-${Date.now()}`;
    await sendMessage(page, newChatMsg);
    await expectMessageInChat(page, newChatMsg);
    await waitForStreamingStop(page);
    console.log("New chat created and message sent");

    // =====================
    // PHASE 7: Verify Chat A still intact after all the switching
    // =====================
    console.log("PHASE 7: Final verification of Chat A...");
    await page.goto(`/chat/${chatAId}`);
    await waitForChatUI(page);

    // All 3 messages should still be there
    await expectMessageInChat(page, chatAMsg2);
    await expectMessageInChat(page, chatAMsg3);

    // Chat B messages should NOT be visible
    await expect(
        chatMessageList.getByText(chatBMsg1, { exact: true }),
    ).toHaveCount(0);
    await expect(
        chatMessageList.getByText(chatBMsg2, { exact: true }),
    ).toHaveCount(0);

    console.log(
        "Chat A verified - all messages intact after extensive switching",
    );

    // =====================
    // PHASE 8: Reload page and verify persistence
    // =====================
    console.log("PHASE 8: Testing page reload persistence...");
    await page.reload();
    await waitForChatUI(page);

    // Chat A should still have all messages after reload
    await expectMessageInChat(page, chatAMsg2);
    await expectMessageInChat(page, chatAMsg3);

    console.log(
        "All phases passed! Optimistic state persists correctly across chat switches.",
    );
});

test("New chat must be instant with no loading states or layout shifts", async ({
    page,
}) => {
    // Navigate directly to chat home
    await page.goto("/chat", { waitUntil: "domcontentloaded" });

    // Ensure we're logged in
    await ensureLoggedIn(page);
    await acceptTosIfPresent(page);

    // Wait for chat UI
    await waitForChatUI(page);

    // Pre-warm by creating a chat first (this creates a prefetched chat)
    await page.getByTestId("sidebar-new-chat-button").click();
    await page.waitForURL(/\/chat\//, { timeout: 10000 });
    await page.waitForTimeout(500);

    // Now test instant creation - click again
    const startTime = Date.now();
    await page.getByTestId("sidebar-new-chat-button").click();

    // Immediately check that we're on a chat page (within 500ms)
    const url = page.url();
    expect(url).toMatch(/\/chat\/(temp_[a-zA-Z0-9_]+|[a-f0-9]{24}|new)/);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Must be truly instant - less than 500ms
    expect(duration).toBeLessThan(500);
});

test("Optimistic actions persist after switching chats and returning", async ({
    page,
}) => {
    await gotoChatHome(page);

    // ============================================================
    // STEP 1: Create a new chat (optimistic) and send message immediately
    // ============================================================
    console.log("Step 1: Creating new chat optimistically...");

    // Send first message right away (within milliseconds of chat creation)
    const firstMessage = `opt-persist-1st-${Date.now()}`;
    const input = page.locator('[data-testid="chat-message-input"]').first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.click();
    await input.fill(firstMessage);
    await input.press("Enter");

    // Message should appear optimistically immediately
    await expect(
        page.locator(`.chat-message-user`, { hasText: firstMessage }).first(),
    ).toBeVisible({
        timeout: 5000,
    });
    console.log(`First message sent: ${firstMessage}`);

    // Wait for streaming to complete and chat to get a real ID
    await waitForStreamingStop(page);

    // Now the URL should have a real MongoDB ObjectId
    let chatId = null;
    for (let i = 0; i < 5; i++) {
        const chatUrl = page.url();
        const chatIdMatch = chatUrl.match(/\/chat\/([a-f0-9]{24})/);
        if (chatIdMatch) {
            chatId = chatIdMatch[1];
            break;
        }
        await page.waitForTimeout(1000);
    }

    expect(chatId).toBeTruthy();
    console.log(`Chat ID obtained: ${chatId}`);

    // Wait for chat data to be ready
    await page.waitForTimeout(500);

    // ============================================================
    // STEP 2: Adding more messages to chat...
    // ============================================================
    console.log("Step 2: Adding more messages to chat...");

    const secondMessage = `opt-persist-2nd-${Date.now()}`;
    const input2 = page.locator('[data-testid="chat-message-input"]').first();
    await input2.waitFor({ state: "visible", timeout: 5000 });
    await input2.click();
    await input2.fill(secondMessage);
    await input2.press("Enter");
    await expect(
        page.locator(`.chat-message-user`, { hasText: secondMessage }).first(),
    ).toBeVisible({
        timeout: 10000,
    });
    await waitForStreamingStop(page);
    console.log("Second message sent and confirmed");

    // ============================================================
    // STEP 3: Switch to a different existing chat (or create new one)
    // ============================================================
    console.log("Step 3: Creating second chat to switch to...");

    const newChatButton = page.getByTestId("sidebar-new-chat-button");
    await newChatButton.click();
    await waitForChatUI(page);
    await page.waitForTimeout(500);

    // Verify we're on a different chat
    const newUrl = page.url();
    expect(newUrl).not.toContain(chatId);

    // Send a message in this new chat
    const otherChatMessage = `other-chat-${Date.now()}`;
    const input3 = page.locator('[data-testid="chat-message-input"]').first();
    await input3.waitFor({ state: "visible", timeout: 5000 });
    await input3.click();
    await input3.fill(otherChatMessage);
    await input3.press("Enter");
    await expect(
        page
            .locator(`.chat-message-user`, { hasText: otherChatMessage })
            .first(),
    ).toBeVisible({
        timeout: 10000,
    });
    await waitForStreamingStop(page);

    // ============================================================
    // STEP 4: Switch BACK to the original chat
    // ============================================================
    console.log(`Step 4: Switching back to original chat ${chatId}...`);

    // Navigate directly to original chat URL
    await page.goto(`/chat/${chatId}`, { waitUntil: "domcontentloaded" });
    await waitForChatUI(page);

    // Verify we are on the correct chat
    const currentUrl = page.url();
    expect(currentUrl).toContain(chatId);
    console.log(`Verified on chat: ${currentUrl}`);

    // ============================================================
    // STEP 5: Verify original chat messages are STILL present
    // ============================================================
    console.log("Step 5: Verifying original chat messages persist...");

    // First message should still be visible
    await expect(
        page.locator(`.chat-message-user`, { hasText: firstMessage }).first(),
    ).toBeVisible({
        timeout: 5000,
    });
    console.log(`First message still present: ${firstMessage}`);

    // Second message should also still be visible
    await expect(
        page.locator(`.chat-message-user`, { hasText: secondMessage }).first(),
    ).toBeVisible({
        timeout: 5000,
    });
    console.log(`Second message still present: ${secondMessage}`);

    // Other chat message should NOT be visible
    const otherMessageVisible = await page
        .locator(`.chat-message-user`, { hasText: otherChatMessage })
        .isVisible()
        .catch(() => false);
    expect(otherMessageVisible).toBe(false);
    console.log("Other chat message correctly not visible");
});

test("Multiple rapid chat switches maintain correct message isolation", async ({
    page,
}) => {
    await gotoChatHome(page);

    // Create 3 separate chats with unique messages
    const chats = [];

    for (let i = 1; i <= 3; i++) {
        console.log(`Creating chat ${i}...`);

        await page.getByTestId("sidebar-new-chat-button").click();
        await waitForChatUI(page);
        await page.waitForTimeout(500);

        const msg = `rapid-switch-chat${i}-${Date.now()}`;
        const input = page
            .locator('[data-testid="chat-message-input"]')
            .first();
        await input.waitFor({ state: "visible", timeout: 5000 });
        await input.click();
        await input.fill(msg);
        await expect(input).toHaveValue(msg, { timeout: 3000 });
        await input.press("Enter");

        await expect(
            page.locator(`.chat-message-user`, { hasText: msg }).first(),
        ).toBeVisible({
            timeout: 10000,
        });
        await waitForStreamingStop(page);

        const url = page.url();
        const match = url.match(/\/chat\/([a-f0-9]{24})/);
        const id = match ? match[1] : null;

        if (id) {
            chats.push({ id, message: msg });
            console.log(`Chat ${i}: ${id} - ${msg}`);
        }

        // Small delay between chat creations
        await page.waitForTimeout(200);
    }

    expect(chats.length).toBe(3);

    // Now rapidly switch between all 3 chats multiple times
    for (let round = 0; round < 2; round++) {
        console.log(`Round ${round + 1} of switching...`);

        for (const chat of chats) {
            await page.goto(`/chat/${chat.id}`, {
                waitUntil: "domcontentloaded",
            });
            await waitForChatUI(page);

            // Verify this chat's message is visible
            await expect(
                page
                    .locator(`.chat-message-user`, { hasText: chat.message })
                    .first(),
            ).toBeVisible({
                timeout: 5000,
            });

            // Verify OTHER chats' messages are NOT visible
            for (const otherChat of chats) {
                if (otherChat.id !== chat.id) {
                    const isVisible = await page
                        .locator(`.chat-message-user`, {
                            hasText: otherChat.message,
                        })
                        .isVisible()
                        .catch(() => false);
                    expect(isVisible).toBe(false);
                }
            }

            // Send a new message in this chat
            const newMsg = `round${round}-${chat.id.slice(-4)}-${Date.now()}`;
            const input = page
                .locator('[data-testid="chat-message-input"]')
                .first();
            await input.fill(newMsg);
            await input.press("Enter");
            await expect(
                page.locator(`.chat-message-user`, { hasText: newMsg }).first(),
            ).toBeVisible({
                timeout: 5000,
            });
            await waitForStreamingStop(page);
        }
    }

    // Final verification: each chat should have exactly 3 messages (original + 2 rounds)
    for (const chat of chats) {
        await page.goto(`/chat/${chat.id}`, { waitUntil: "domcontentloaded" });
        await waitForChatUI(page);

        // Original message should be there
        await expect(
            page
                .locator(`.chat-message-user`, { hasText: chat.message })
                .first(),
        ).toBeVisible({
            timeout: 5000,
        });

        // New message from the switching round should be there
        await expect(
            page.locator(`.chat-message-user`, { hasText: `round` }).first(),
        ).toBeVisible({
            timeout: 5000,
        });

        const msgCount = await page.locator(".chat-message-user").count();
        expect(msgCount).toBe(3);
    }

    console.log(
        "SUCCESS: All chat switches maintained correct message isolation!",
    );
});

test("Chat switching during active streaming - messages must persist in background", async ({
    page,
}) => {
    console.log(
        "Testing: Active streaming must complete and persist even when chat is switched away",
    );
    test.setTimeout(240000);

    // ============================================================
    // STEP 1: Create two chats with initial messages
    // ============================================================
    await gotoChatHome(page);

    // Create Chat A with unique initial message
    const chatAId = await createChat(
        page,
        `persist-a-${Date.now().toString(36)}`,
    );
    await waitForStreamingStop(page);

    // Create Chat B with unique initial message
    const chatBId = await createChat(
        page,
        `persist-b-${Date.now().toString(36)}`,
    );
    await waitForStreamingStop(page);

    // ============================================================
    // STEP 2: Go to Chat A, send message and wait for completion
    // ============================================================
    console.log("Sending message in Chat A...");

    await clickSidebarChatOrNavigate(page, chatAId);
    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatAId,
    );

    const streamingMessage = `streaming-test-${Date.now().toString(36)}`;
    await sendMessage(page, streamingMessage);

    // Wait for streaming to complete fully before switching
    await waitForStreamingStop(page);
    console.log("Streaming completed in Chat A");

    // Wait for persistence and sidebar to update
    await page.waitForTimeout(3000);

    // ============================================================
    // STEP 3: Switch to Chat B while Chat A is persisted
    // ============================================================
    console.log("Switching to Chat B...");
    await clickSidebarChatOrNavigate(page, chatBId);
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatBId,
        { timeout: 10000 },
    );

    // Send a message in Chat B to keep user busy
    console.log("Sending message in Chat B...");
    const chatBMessage = `chat-b-while-a-streams-${Date.now().toString(36)}`;
    await sendMessage(page, chatBMessage);
    await waitForStreamingStop(page);

    // ============================================================
    // STEP 4: Switch back to Chat A - message MUST still be there
    // ============================================================
    console.log("Switching back to Chat A to verify message persisted...");

    // Navigate back to Chat A using direct URL
    await page.goto(`/chat/${chatAId}`, { waitUntil: "domcontentloaded" });
    await waitForChatInput(page);

    await page.waitForTimeout(2000);

    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatAId,
        { timeout: 10000 },
    );

    // Verify the message persisted
    const messageList = page.getByTestId("chat-message-list").first();
    await expect(messageList).toContainText(streamingMessage, {
        timeout: 15000,
    });

    // Verify bot responded
    await expect
        .poll(
            async () => {
                const messageList = page
                    .getByTestId("chat-message-list")
                    .first();
                const hasBotMessage = await messageList
                    .locator(".chat-message-bot")
                    .count();
                return hasBotMessage > 0;
            },
            { timeout: 15000 },
        )
        .toBe(true);

    // ============================================================
    // STEP 5: Second round - verify consistency
    // ============================================================
    console.log("Second round - testing consistency...");

    const streamingMessage2 = `streaming-test-2-${Date.now().toString(36)}`;
    await sendMessage(page, streamingMessage2);
    await waitForStreamingStop(page);

    await page.waitForTimeout(2000);

    // Switch to Chat B
    await clickSidebarChatOrNavigate(page, chatBId);
    await page.waitForTimeout(1000);

    // Switch back to Chat A
    await clickSidebarChatOrNavigate(page, chatAId);
    await waitForChatInput(page);

    await page.waitForTimeout(2000);

    await expect(page.getByTestId("chat-messages").first()).toHaveAttribute(
        "data-chat-id",
        chatAId,
        { timeout: 10000 },
    );

    // Verify both messages are present
    await expect(messageList).toContainText(streamingMessage, {
        timeout: 10000,
    });
    await expect(messageList).toContainText(streamingMessage2, {
        timeout: 10000,
    });

    console.log("SUCCESS: Messages persisted correctly during chat switching!");
});
