import {
    AUTOMATIONS_LAST_VIEWED_STORAGE_KEY,
    getAutomationsLastViewedAt,
    hasUnreadAutomationResults,
    isAutomationUnread,
    markAutomationsViewed,
    markAutomationRead,
    getAutomationReadReceipts,
    AUTOMATION_READ_RECEIPTS_STORAGE_KEY,
} from "../automationsUnread";

describe("automationsUnread", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("stores and reads last viewed timestamp", () => {
        const iso = markAutomationsViewed("2026-08-04T12:00:00.000Z");
        expect(iso).toBe("2026-08-04T12:00:00.000Z");
        expect(getAutomationsLastViewedAt()).toBe(iso);
        expect(
            window.localStorage.getItem(AUTOMATIONS_LAST_VIEWED_STORAGE_KEY),
        ).toBe(iso);
    });

    it("treats any lastRunAt as unread when never viewed", () => {
        expect(
            isAutomationUnread({ lastRunAt: "2026-08-04T12:00:00.000Z" }, null),
        ).toBe(true);
    });

    it("compares lastRunAt against last viewed time", () => {
        const viewedAt = "2026-08-04T12:00:00.000Z";
        expect(
            isAutomationUnread(
                { lastRunAt: "2026-08-04T11:59:00.000Z" },
                viewedAt,
            ),
        ).toBe(false);
        expect(
            isAutomationUnread(
                { lastRunAt: "2026-08-04T12:01:00.000Z" },
                viewedAt,
            ),
        ).toBe(true);
    });

    it("detects unread results across automations", () => {
        expect(
            hasUnreadAutomationResults(
                [
                    { lastRunAt: "2026-08-04T11:00:00.000Z" },
                    { lastRunAt: "2026-08-04T13:00:00.000Z" },
                ],
                "2026-08-04T12:00:00.000Z",
            ),
        ).toBe(true);
        expect(
            hasUnreadAutomationResults(
                [{ lastRunAt: "2026-08-04T11:00:00.000Z" }],
                "2026-08-04T12:00:00.000Z",
            ),
        ).toBe(false);
    });

    it("marks only the observed result read and leaves other and later reports unread", () => {
        const first = { _id: "first", lastRunAt: "2026-09-14T12:00:00Z" };
        const other = { _id: "other", lastRunAt: first.lastRunAt };
        markAutomationRead(first);
        const receipts = getAutomationReadReceipts();
        expect(isAutomationUnread(first, null, receipts)).toBe(false);
        expect(isAutomationUnread(other, null, receipts)).toBe(true);
        expect(
            isAutomationUnread(
                { ...first, lastRunAt: "2026-09-14T13:00:00Z" },
                null,
                receipts,
            ),
        ).toBe(true);
        markAutomationRead({ ...first, lastRunAt: "2026-09-14T11:00:00Z" });
        expect(getAutomationReadReceipts()).toEqual(receipts);
    });

    it("handles damaged read receipts and keeps the legacy read baseline", () => {
        window.localStorage.setItem(
            AUTOMATION_READ_RECEIPTS_STORAGE_KEY,
            "invalid",
        );
        expect(getAutomationReadReceipts()).toEqual({});
        const automation = { _id: "first", lastRunAt: "2026-09-14T12:00:00Z" };
        expect(
            isAutomationUnread(automation, "2026-09-14T13:00:00Z", {
                first: "bad",
            }),
        ).toBe(false);
        expect(
            markAutomationRead({ ...automation, lastRunAt: "invalid" }),
        ).toEqual({});
    });

    it("retains other read results in memory when browser storage is unavailable", () => {
        const storageWrite = jest
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(() => {
                throw new Error("Storage unavailable");
            });
        try {
            const first = { _id: "first", lastRunAt: "2026-09-14T12:00:00Z" };
            const second = { _id: "second", lastRunAt: first.lastRunAt };
            const current = markAutomationRead(first);
            const next = markAutomationRead(second, current);
            expect(isAutomationUnread(first, null, next)).toBe(false);
            expect(isAutomationUnread(second, null, next)).toBe(false);
            expect(current).not.toHaveProperty("second");
        } finally {
            storageWrite.mockRestore();
        }
    });
});
