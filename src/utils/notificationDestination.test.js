import { normalizeNotificationDestination } from "./notificationDestination";
import { getNotificationNavigationPath } from "./shareNotificationUtils";

it.each([
    "/chat/thread",
    "/automations/task/runs/run",
    "https://example.com/report?day=1",
    "http://localhost:3002/applets/view/report",
])("accepts navigation destination %s", (url) => {
    expect(normalizeNotificationDestination(url)).toBe(url);
    expect(
        getNotificationNavigationPath({
            type: "colleague-message",
            metadata: { url, chatId: "fallback" },
        }),
    ).toBe(url);
});
it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "//evil.test",
    "/\\evil.test",
    "https://user:password@example.com",
    "https://example.com/\nreport",
    "relative/path",
    "x".repeat(2049),
])("rejects executable or ambiguous navigation %s", (url) => {
    expect(normalizeNotificationDestination(url)).toBeNull();
    expect(
        getNotificationNavigationPath({
            type: "colleague-message",
            metadata: { url, chatId: "fallback" },
        }),
    ).toBe("/chat/fallback");
});
