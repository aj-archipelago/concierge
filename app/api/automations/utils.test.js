/**
 * @jest-environment node
 */

jest.mock("../models/automation.js", () => ({
    __esModule: true,
    default: {},
}));

jest.mock("../models/task.mjs", () => ({
    __esModule: true,
    default: {},
}));

jest.mock("../utils/media-service-utils.js", () => ({
    deleteMediaFile: jest.fn(),
    hashBuffer: jest.fn(),
    listAutomationFiles: jest.fn(),
    readBlobContent: jest.fn(),
    uploadBufferToMediaService: jest.fn(),
}));

describe("automation utils", () => {
    const {
        automationEffectiveEnabled,
        calculateNextRunAt,
        normalizeAutomationSlug,
        normalizeSchedule,
        parseAutomationTaskOutput,
        validateAutomationSlug,
    } = require("./utils");

    test("automationEffectiveEnabled rejects manual schedules", () => {
        expect(automationEffectiveEnabled(true, { frequency: "manual" })).toBe(
            false,
        );
        expect(automationEffectiveEnabled(true, { frequency: "daily" })).toBe(
            true,
        );
        expect(automationEffectiveEnabled(false, { frequency: "daily" })).toBe(
            false,
        );
    });

    test("normalizes and validates slugs", () => {
        expect(normalizeAutomationSlug(" Weekly Digest! ")).toBe(
            "weekly-digest",
        );
        expect(validateAutomationSlug("weekly-digest")).toBe(true);
        expect(validateAutomationSlug("-weekly")).toBe(false);
    });

    test("normalizes schedule input", () => {
        expect(
            normalizeSchedule({
                frequency: "daily",
                interval: "3",
                time: "25:99",
                dayOfWeek: 9,
            }),
        ).toEqual({
            frequency: "daily",
            interval: 3,
            time: "09:00",
            times: ["09:00"],
            dayOfWeek: 1,
            daysOfWeek: [1],
            hourlyMode: "interval",
            minute: 0,
        });
    });

    test("normalizes multiple times and days", () => {
        expect(
            normalizeSchedule({
                frequency: "weekly",
                times: ["18:00", "bad", "06:00", "06:00"],
                daysOfWeek: [5, "1", 12, 1],
            }),
        ).toEqual({
            frequency: "weekly",
            interval: 1,
            time: "06:00",
            times: ["06:00", "18:00"],
            dayOfWeek: 1,
            daysOfWeek: [1, 5],
            hourlyMode: "interval",
            minute: 0,
        });
    });

    test("calculates next daily run in timezone", () => {
        const next = calculateNextRunAt(
            { frequency: "daily", time: "09:00" },
            "UTC",
            new Date("2026-04-28T08:00:00.000Z"),
        );

        expect(next.toISOString()).toBe("2026-04-28T09:00:00.000Z");
    });

    test("moves daily run to tomorrow after scheduled time", () => {
        const next = calculateNextRunAt(
            { frequency: "daily", time: "09:00" },
            "UTC",
            new Date("2026-04-28T10:00:00.000Z"),
        );

        expect(next.toISOString()).toBe("2026-04-29T09:00:00.000Z");
    });

    test("calculates next daily run with multiple times", () => {
        const next = calculateNextRunAt(
            { frequency: "daily", times: ["06:00", "18:00"] },
            "UTC",
            new Date("2026-04-28T07:00:00.000Z"),
        );

        expect(next.toISOString()).toBe("2026-04-28T18:00:00.000Z");
    });

    test("calculates next weekly run across multiple days", () => {
        const next = calculateNextRunAt(
            { frequency: "weekly", daysOfWeek: [1, 5], times: ["09:00"] },
            "UTC",
            new Date("2026-04-28T10:00:00.000Z"),
        );

        expect(next.toISOString()).toBe("2026-05-01T09:00:00.000Z");
    });

    test("calculates clock-aligned hourly runs", () => {
        const next = calculateNextRunAt(
            {
                frequency: "hourly",
                hourlyMode: "clock",
                interval: 1,
                minute: 0,
            },
            "UTC",
            new Date("2026-04-28T10:14:00.000Z"),
        );

        expect(next.toISOString()).toBe("2026-04-28T11:00:00.000Z");
    });

    test("finds HTML output when summary and result fields differ", () => {
        const parsed = parseAutomationTaskOutput({
            data: {
                summary: "Plain summary",
                result: JSON.stringify({
                    summary: "Generated HTML",
                    html: "<!doctype html><html><body>Digest</body></html>",
                }),
            },
        });

        expect(parsed.summary).toBe("Generated HTML");
        expect(parsed.html).toContain("<html>");
    });

    test("finds HTML output when the JSON object is stored in summary", () => {
        const parsed = parseAutomationTaskOutput({
            data: {
                summary: {
                    summary: "Generated HTML",
                    html: "<!doctype html><html><body>Digest</body></html>",
                },
                result: "Plain summary",
            },
        });

        expect(parsed.summary).toBe("Generated HTML");
        expect(parsed.html).toContain("<html>");
    });

    test("parses fenced JSON automation output with surrounding text", () => {
        const parsed = parseAutomationTaskOutput({
            data: {
                result: `Here is the output:

\`\`\`json
{
  "summary": "Generated a front page",
  "html": "<!doctype html>\\n<html lang=\\"en\\" data-theme=\\"light\\"><body><main>Front Page</main></body></html>"
}
\`\`\`
`,
            },
        });

        expect(parsed.summary).toBe("Generated a front page");
        expect(parsed.html).toBe(
            '<!doctype html>\n<html lang="en" data-theme="light"><body><main>Front Page</main></body></html>',
        );
    });
});
