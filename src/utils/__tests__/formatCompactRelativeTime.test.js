import { formatCompactRelativeTime } from "../formatCompactRelativeTime";

describe("formatCompactRelativeTime", () => {
    const now = Date.parse("2026-08-04T12:00:00.000Z");

    it("returns empty string for missing or invalid values", () => {
        expect(formatCompactRelativeTime(null, now)).toBe("");
        expect(formatCompactRelativeTime("not-a-date", now)).toBe("");
    });

    it("formats minutes, hours, and days compactly", () => {
        expect(formatCompactRelativeTime("2026-08-04T11:26:00.000Z", now)).toBe(
            "34m",
        );
        expect(formatCompactRelativeTime("2026-08-04T11:00:00.000Z", now)).toBe(
            "1h",
        );
        expect(formatCompactRelativeTime("2026-07-28T12:00:00.000Z", now)).toBe(
            "7d",
        );
    });

    it("uses at least 1m for very recent times", () => {
        expect(formatCompactRelativeTime("2026-08-04T11:59:50.000Z", now)).toBe(
            "1m",
        );
    });
});
