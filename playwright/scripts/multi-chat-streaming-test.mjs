// Multi-Chat Streaming Isolation Test
// Tests that multiple chats can stream independently
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const SCREENSHOTS_DIR = process.env.PLAYWRIGHT_SCREENSHOTS_DIR
    ? path.resolve(process.env.PLAYWRIGHT_SCREENSHOTS_DIR)
    : path.resolve(process.cwd(), ".playwright-cli");

async function takeScreenshot(page, name) {
    const screenshotPath = path.join(SCREENSHOTS_DIR, `multi-chat-${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
}

async function handleToS(page) {
    // Check for ToS modal - look for the "I Accept" button
    const acceptButton = page.locator('button:has-text("I Accept")');
    const hasToS = await acceptButton.isVisible().catch(() => false);

    if (!hasToS) {
        console.log("No ToS modal detected");
        return;
    }

    console.log("ToS modal detected, attempting to scroll and accept...");

    // The ToS needs to be scrolled to the bottom to enable the Accept button
    // Find the scrollable area within the modal (the area with bullet points)
    const scrollResult = await page.evaluate(() => {
        // Look for the scrollable content area in the ToS modal
        // It's typically a div with overflow-y: auto that contains the terms text
        const scrollableAreas = [];
        document.querySelectorAll("*").forEach((el) => {
            const style = window.getComputedStyle(el);
            if (el.scrollHeight > el.clientHeight + 20) {
                scrollableAreas.push({
                    tag: el.tagName,
                    class: el.className,
                    scrollHeight: el.scrollHeight,
                    clientHeight: el.clientHeight,
                    scrollable:
                        style.overflowY === "auto" ||
                        style.overflowY === "scroll",
                });
                // Scroll it
                el.scrollTop = el.scrollHeight;
            }
        });
        return scrollableAreas;
    });

    console.log(`Found ${scrollResult.length} scrollable areas`);
    await page.waitForTimeout(500);

    // Check if button is now enabled
    let isDisabled = await acceptButton.evaluate((btn) => btn.disabled);
    console.log(`Accept button disabled after first scroll: ${isDisabled}`);

    if (isDisabled) {
        // Try scrolling with mouse wheel on the modal content
        console.log("Trying mouse wheel scroll...");
        const modalContent = page.locator("ul").first();
        if (await modalContent.isVisible().catch(() => false)) {
            await modalContent.hover();
            for (let i = 0; i < 20; i++) {
                await page.mouse.wheel(0, 300);
                await page.waitForTimeout(100);
            }
        }
        await page.waitForTimeout(500);
        isDisabled = await acceptButton.evaluate((btn) => btn.disabled);
        console.log(`Accept button disabled after mouse scroll: ${isDisabled}`);
    }

    // Click the button
    if (!isDisabled) {
        await acceptButton.click();
        console.log("Clicked Accept button");
    } else {
        console.log("Button still disabled, trying force click...");
        await acceptButton.click({ force: true });
    }
    await page.waitForTimeout(2000);

    // Verify ToS is dismissed
    const stillVisible = await acceptButton.isVisible().catch(() => false);
    if (stillVisible) {
        console.log("WARNING: ToS button still visible after click");
    } else {
        console.log("ToS modal dismissed successfully");
    }
}

async function handleLogin(page) {
    // Check for Sign in page - local development authentication
    const signInButton = page.locator('button:has-text("Sign in")');
    const hasLogin = await signInButton.isVisible().catch(() => false);

    if (!hasLogin) {
        console.log("No login page detected");
        return;
    }

    console.log("Login page detected, signing in...");

    // Find email input and enter a test email
    const emailInput = page
        .locator('input[type="email"], input[placeholder*="email" i]')
        .first();
    if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill("test@example.com");
        console.log("Entered test email");
        await page.waitForTimeout(500);

        // Click Sign in
        await signInButton.click();
        console.log("Clicked Sign in");
        await page.waitForTimeout(3000);
    } else {
        console.log("Email input not found");
    }
}

async function runTest() {
    console.log("Starting multi-chat streaming isolation test...");

    const defaultExecutablePath = chromium.executablePath();
    let executablePath = defaultExecutablePath;
    if (!fs.existsSync(defaultExecutablePath)) {
        const arm64Path = defaultExecutablePath.replace(
            "chrome-mac-x64",
            "chrome-mac-arm64",
        );
        if (fs.existsSync(arm64Path)) {
            executablePath = arm64Path;
        }
    }

    const browser = await chromium.launch({
        headless: false,
        executablePath,
        args: [
            "--disable-crashpad",
            "--disable-crash-reporter",
            "--disable-crashpad-for-testing",
        ],
    });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
    });
    const page = await context.newPage();

    try {
        // Step 1: Navigate to /chat
        console.log("\n=== Step 1: Navigate to http://localhost:3000/chat ===");
        await page.goto("http://localhost:3000/chat", {
            waitUntil: "load",
            timeout: 60000,
        });
        await page.waitForTimeout(3000); // Wait for React to render

        await takeScreenshot(page, "00-page-loaded");

        // Handle Terms of Service modal if present
        await handleToS(page);

        await takeScreenshot(page, "01-after-tos");

        // Handle Login if shown
        await handleLogin(page);

        await takeScreenshot(page, "01b-after-login");
        console.log("Navigated to chat page successfully");

        // Check if ToS is still showing
        const tosStillVisible = await page
            .locator('button:has-text("I Accept")')
            .isVisible()
            .catch(() => false);
        if (tosStillVisible) {
            console.log("ERROR: ToS modal could not be dismissed");
            await takeScreenshot(page, "01-tos-not-dismissed");
            throw new Error("ToS modal could not be dismissed");
        }

        // Check if login is still showing
        const loginStillVisible = await page
            .locator("text=Sign in to your account")
            .isVisible()
            .catch(() => false);
        if (loginStillVisible) {
            console.log("ERROR: Login could not be completed");
            await takeScreenshot(page, "01-login-not-completed");
            throw new Error("Login could not be completed");
        }

        // Check if there are existing chats in the sidebar
        // The sidebar chat items are li elements with truncate class, not a tags
        const sidebarChatLinks = await page
            .locator("nav li .truncate, aside li .truncate")
            .all();
        console.log(
            `Found ${sidebarChatLinks.length} existing chats in sidebar`,
        );

        // Step 2: Click "New Chat" and send a message
        console.log(
            '\n=== Step 2: Click "New Chat" and send a long message ===',
        );

        // Find the New Chat button - look for the plus icon or "New Chat" text
        const newChatButton = page
            .locator(
                '[data-testid="sidebar-new-chat-button"], button:has-text("New"), [aria-label*="new" i], a[href="/chat"]',
            )
            .first();
        const newChatExists = await newChatButton
            .isVisible()
            .catch(() => false);

        if (newChatExists) {
            await newChatButton.click();
            await page.waitForTimeout(1000);
            console.log("Clicked New Chat button");
        } else {
            console.log(
                "No New Chat button found, may already be on new chat page",
            );
        }

        await takeScreenshot(page, "02-new-chat-ready");

        // Find the message input - look for various possible selectors
        const inputSelector =
            '[data-testid="chat-message-input"], textarea[placeholder*="Send" i], textarea[placeholder*="Message" i], textarea, input[type="text"][placeholder*="Send" i], input[type="text"][placeholder*="Message" i], [contenteditable="true"]';
        await page
            .waitForSelector(inputSelector, {
                state: "visible",
                timeout: 15000,
            })
            .catch(() => null);

        let messageInput = page.locator(inputSelector).first();
        let inputVisible = await messageInput.isVisible().catch(() => false);

        if (!inputVisible) {
            console.log(
                "Cannot find message input, taking debug screenshot...",
            );
            await takeScreenshot(page, "debug-no-input");
            throw new Error("Message input not found");
        }

        // Type a message that will generate a long response
        const longMessage =
            "Write a detailed 3-paragraph story about a dragon who discovers a hidden library in a mountain cave. Include vivid descriptions and dialogue.";
        await messageInput.fill(longMessage);
        console.log("Filled in the long message");

        await takeScreenshot(page, "03-message-typed");

        // Send the message - try clicking send button or pressing Enter
        const sendButton = page
            .locator('[data-testid="chat-send-button"], button[type="submit"]')
            .first();
        const sendButtonExists = await sendButton
            .isVisible()
            .catch(() => false);

        if (sendButtonExists) {
            await sendButton.click();
            console.log("Clicked send button");
        } else {
            // Try pressing Enter (Command+Enter or just Enter depending on app)
            await messageInput.press("Enter");
            console.log("Pressed Enter to send");
        }

        // Step 3: Wait for streaming to start and capture it
        console.log("\n=== Step 3: Wait for streaming to start ===");
        await page.waitForTimeout(3000); // Wait for response to start

        // Look for streaming indicators
        const streamingIndicators = [
            '[class*="loading"]',
            '[class*="streaming"]',
            '[class*="typing"]',
            ".animate-pulse",
            '[class*="cursor"]',
            ".cursor-blink",
            '[class*="skeleton"]',
        ];

        let isStreaming = false;
        for (const selector of streamingIndicators) {
            const indicator = page.locator(selector);
            if (await indicator.isVisible().catch(() => false)) {
                isStreaming = true;
                console.log(`Found streaming indicator: ${selector}`);
                break;
            }
        }

        // Also check for the message appearing (response starting)
        const responseMessages = page.locator(
            '[class*="ChatMessage"], [class*="message-content"], .prose',
        );
        const responseCount = await responseMessages.count();
        console.log(`Found ${responseCount} message elements`);

        await takeScreenshot(page, "04-streaming-in-progress");

        // Get the current URL to track which chat we're in
        const streamingChatUrl = page.url();
        console.log(`Streaming chat URL: ${streamingChatUrl}`);

        // Step 4: While streaming, click on a different chat in sidebar
        console.log(
            "\n=== Step 4: Click on a different chat while streaming ===",
        );

        // Wait a moment for sidebar to update with the new chat
        await page.waitForTimeout(1500);

        // Look for existing chat items in sidebar
        // Sidebar chats are li elements with .truncate child for the title text
        // They are clickable list items under the Chat section
        const sidebarChats = page.locator('[data-testid="sidebar-chat-item"]');
        const chatCount = await sidebarChats.count();
        console.log(`Found ${chatCount} chat items in sidebar`);

        if (chatCount > 1) {
            // Get current chat id to avoid clicking on same chat
            const currentChatId = await page
                .locator('[data-testid="chat-messages"]')
                .getAttribute("data-chat-id")
                .catch(() => "");
            console.log(`Current chat id: "${currentChatId}"`);

            // Click on a different chat (second item)
            let clickedDifferentChat = false;
            for (let i = 0; i < chatCount; i++) {
                const chatItem = sidebarChats.nth(i);
                const chatId = await chatItem
                    .getAttribute("data-chat-id")
                    .catch(() => "");

                // Skip if this is the current chat
                if (chatId && chatId !== currentChatId) {
                    console.log(`Clicking on different chat: "${chatId}"`);
                    await chatItem.click();
                    clickedDifferentChat = true;
                    break;
                }
            }

            if (!clickedDifferentChat && chatCount >= 2) {
                console.log("Clicking on second chat item...");
                await sidebarChats.nth(1).click();
                clickedDifferentChat = true;
            }

            await page.waitForTimeout(2000);
            await takeScreenshot(page, "05-switched-to-different-chat");

            const newUrl = page.url();
            console.log(`Switched to: ${newUrl}`);

            if (newUrl === streamingChatUrl) {
                console.log("ERROR: URL did not change after switching chats.");
                await takeScreenshot(page, "05-switch-no-url-change");
                throw new Error("Failed to switch to a different chat");
            }

            // Step 5: Verify the other chat doesn't show streaming state
            console.log(
                "\n=== Step 5: Verify other chat is not in streaming state ===",
            );

            let otherChatStreaming = false;
            for (const selector of streamingIndicators) {
                const indicator = page.locator(selector);
                if (await indicator.isVisible().catch(() => false)) {
                    otherChatStreaming = true;
                    console.log(
                        `WARNING: Found streaming indicator in other chat: ${selector}`,
                    );
                    break;
                }
            }

            if (otherChatStreaming) {
                console.log(
                    "ISSUE: Other chat incorrectly shows streaming state!",
                );
            } else {
                console.log(
                    "SUCCESS: Other chat does not show streaming state",
                );
            }

            await takeScreenshot(page, "06-other-chat-loaded");

            // Step 6: Navigate back to the streaming chat
            console.log(
                "\n=== Step 6: Navigate back to the streaming chat ===",
            );

            // Find and click on the streaming chat (should be visible in sidebar)
            await page.goto(streamingChatUrl, {
                waitUntil: "load",
                timeout: 60000,
            });
            await page.waitForTimeout(2000);

            await takeScreenshot(page, "07-back-to-streaming-chat");

            // Step 7: Verify streaming content is preserved or completed
            console.log(
                "\n=== Step 7: Verify streaming content is preserved/completed ===",
            );

            // Check if content is present
            const messageContent = page.locator(
                '[class*="message"], [class*="chat-message"], .prose, [class*="ChatMessage"]',
            );
            const messageCount = await messageContent.count();
            console.log(`Found ${messageCount} message elements`);

            // Check if still streaming or completed
            let stillStreaming = false;
            for (const selector of streamingIndicators) {
                const indicator = page.locator(selector);
                if (await indicator.isVisible().catch(() => false)) {
                    stillStreaming = true;
                    break;
                }
            }

            if (stillStreaming) {
                console.log("Content is still streaming (response was long)");
                // Wait for streaming to complete
                await page.waitForTimeout(10000);
                await takeScreenshot(page, "08-streaming-completed");
            } else {
                console.log("Streaming has completed");
            }

            // Take final screenshot
            await takeScreenshot(page, "09-final-state");

            // Summary
            console.log("\n=== TEST SUMMARY ===");
            console.log("1. Navigated to chat page: SUCCESS");
            console.log("2. Created new chat and sent message: SUCCESS");
            console.log(
                `3. Streaming started: ${isStreaming ? "DETECTED" : "NOT DETECTED (may be fast)"}`,
            );
            console.log(`4. Switched to different chat: SUCCESS`);
            console.log(
                `5. Other chat streaming state: ${otherChatStreaming ? "ISSUE - shows streaming" : "SUCCESS - no streaming"}`,
            );
            console.log("6. Navigated back to streaming chat: SUCCESS");
            console.log(
                `7. Content preserved: ${messageCount > 0 ? "SUCCESS" : "NEEDS VERIFICATION"}`,
            );
        } else {
            console.log(
                "Not enough chats to test multi-chat streaming. Need at least 2 chats.",
            );
            console.log("Creating a second chat for testing...");

            // Wait for streaming to complete first
            await page.waitForTimeout(10000);
            await takeScreenshot(page, "05-waiting-for-first-chat");

            // Create a second chat
            const newChatBtn = page
                .locator('a[href="/chat"], button:has-text("New")')
                .first();
            if (await newChatBtn.isVisible().catch(() => false)) {
                await newChatBtn.click();
                await page.waitForTimeout(2000);

                // Send a quick message
                const input = page.locator("textarea").first();
                if (await input.isVisible().catch(() => false)) {
                    await input.fill("Hello, this is a test message.");
                    const submitBtn = page
                        .locator('button[type="submit"]')
                        .first();
                    if (await submitBtn.isVisible().catch(() => false)) {
                        await submitBtn.click();
                    } else {
                        await input.press("Enter");
                    }
                    await page.waitForTimeout(3000);
                }

                await takeScreenshot(page, "06-second-chat-created");

                // Now go back to the first chat and verify content
                await page.goto(streamingChatUrl, {
                    waitUntil: "load",
                    timeout: 60000,
                });
                await page.waitForTimeout(2000);

                await takeScreenshot(page, "07-back-to-first-chat");

                // Check content preserved
                const messageContent = page.locator(
                    '[class*="message"], .prose, [class*="ChatMessage"]',
                );
                const msgCount = await messageContent.count();
                console.log(
                    `Content preserved - found ${msgCount} message elements`,
                );
            }
        }
    } catch (error) {
        console.error("Test error:", error);
        await takeScreenshot(page, "error-state");
        throw error;
    } finally {
        console.log("\nClosing browser...");
        await browser.close();
    }
}

runTest().catch(console.error);
