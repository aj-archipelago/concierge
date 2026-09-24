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

jest.mock("../utils/shareAccess.js", () => ({
    resolveShareAccess: jest.fn(),
}));

describe("automation utils", () => {
    const {
        automationEffectiveEnabled,
        calculateNextRunAt,
        listAutomationSupportingFiles,
        normalizeAutomationSlug,
        normalizeSchedule,
        parseAutomationTaskOutput,
        resolveAutomationRunHtml,
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

    test("parses widget HTML alongside full HTML output", () => {
        const parsed = parseAutomationTaskOutput({
            data: {
                result: JSON.stringify({
                    summary: "Generated HTML",
                    html: "<!doctype html><html><body>Full digest</body></html>",
                    widgetHtml:
                        "<!doctype html><html><body>Widget digest</body></html>",
                }),
            },
        });

        expect(parsed.summary).toBe("Generated HTML");
        expect(parsed.html).toContain("Full digest");
        expect(parsed.widgetHtml).toContain("Widget digest");
    });

    test("prefers stored widget HTML for the widget variant", () => {
        const task = {
            automation: {
                htmlOutputPath: "automations/daily/outputs/task-1/index.html",
                widgetHtmlOutputPath:
                    "automations/daily/outputs/task-1/widget.html",
            },
            data: {
                html: "<html>full</html>",
                widgetHtml: "<html>widget</html>",
            },
        };

        expect(resolveAutomationRunHtml(task, { variant: "widget" })).toEqual({
            blobPath: "automations/daily/outputs/task-1/widget.html",
            html: "<html>widget</html>",
            source: "widget",
        });
        expect(resolveAutomationRunHtml(task)).toEqual({
            blobPath: "automations/daily/outputs/task-1/index.html",
            html: "<html>full</html>",
            source: "full",
        });
    });

    test("falls back to full HTML when no widget version exists", () => {
        const task = {
            automation: {
                htmlOutputPath: "automations/daily/outputs/task-1/index.html",
            },
            data: { html: "<html>full</html>" },
        };

        expect(resolveAutomationRunHtml(task, { variant: "widget" })).toEqual({
            blobPath: "automations/daily/outputs/task-1/index.html",
            html: "<html>full</html>",
            source: "full",
        });
    });

    test("describes a compact home widget in the HTML output contract", () => {
        const { buildAutomationHtmlOutputContract } = require("./utils");
        const contract = buildAutomationHtmlOutputContract();
        expect(contract).toContain('"widgetHtml"');
        expect(contract).toContain("HOME WIDGET DESIGN CONTRACT");
        expect(contract).toContain("320px");
        expect(contract).not.toContain("ConciergeSDK.locale");
        expect(contract).toContain("same facts as html");
        expect(contract).toContain(
            "summary uses Markdown :cd_source[searchResultId]",
        );
        expect(contract).toContain("html and widgetHtml use HTML source links");
        expect(contract).toContain(
            "Copy URLs from the supplied source records",
        );
        expect(contract).not.toContain("ConciergeSDK.agent.render");
    });

    test("lists supporting files without automation instructions or generated outputs", async () => {
        const {
            listAutomationFiles,
        } = require("../utils/media-service-utils.js");
        listAutomationFiles.mockResolvedValue([
            {
                name: "automations/daily/AUTOMATION.md",
                filename: "AUTOMATION.md",
            },
            {
                name: "automations/daily/references.pdf",
                filename: "references.pdf",
            },
            {
                name: "automations/daily/outputs/task-1/index.html",
                filename: "index.html",
            },
        ]);

        await expect(
            listAutomationSupportingFiles("user-context", "daily"),
        ).resolves.toEqual([
            {
                name: "automations/daily/references.pdf",
                filename: "references.pdf",
            },
        ]);
    });
});
