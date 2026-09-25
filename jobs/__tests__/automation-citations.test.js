/** @jest-environment node */
import automationRunTask from "../tasks/automation-run.mjs";
import Automation from "../../app/api/models/automation.js";
import Task from "../../app/api/models/task.mjs";
import User from "../../app/api/models/user.mjs";
import { writeAutomationOutputFile } from "../../app/api/automations/utils.js";
import { parkAssistantTurn } from "../../app/api/utils/assistant-coordination.mjs";
jest.mock("../../app/api/utils/assistant-coordination.mjs", () => ({
    prepareAssistantTurn: jest.fn(),
    parkAssistantTurn: jest.fn(async () => false),
}));

jest.mock("../../app/api/utils/agent-tool-capabilities.mjs", () => ({}));
jest.mock("../../app/api/utils/colleagues.js", () => ({}));
jest.mock("../../app/api/models/automation.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), findByIdAndUpdate: jest.fn() },
}));
jest.mock("../../app/api/models/task.mjs", () => ({
    __esModule: true,
    default: { findByIdAndUpdate: jest.fn() },
}));
jest.mock("../../app/api/models/user.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../graphql.mjs", () => ({}));
jest.mock("../../app/api/automations/utils.js", () => ({
    parseAutomationResult: (value) => value,
    sanitizeGeneratedHtml: (value) => value,
    buildHtmlPreview: (value) => value,
    writeAutomationOutputFile: jest.fn().mockResolvedValue("new-output.html"),
}));
jest.mock("../../app/api/utils/llm-file-utils.js", () => ({}));
jest.mock("../../app/api/utils/mcp-agent-config.js", () => ({}));
jest.mock("../../app/api/utils/media-service-utils.js", () => ({}));

beforeEach(() => {
    jest.clearAllMocks();
    Automation.findByIdAndUpdate.mockResolvedValue({});
    Automation.findOne.mockResolvedValue({
        _id: "automation",
        name: "Report",
        slug: "report",
        producesHtml: true,
        enabled: false,
    });
    User.findById.mockResolvedValue({ contextId: "user-context" });
});

test("a waiting turn does not replace the latest report with its partial response", async () => {
    parkAssistantTurn.mockResolvedValueOnce(true);
    const save = jest.spyOn(automationRunTask, "saveAutomationResult");
    try {
        await expect(
            automationRunTask.handleCompletion(
                "task",
                "Waiting for approval",
                {},
                { userId: "user" },
            ),
        ).resolves.toEqual({ assistantWaiting: true });
        expect(save).not.toHaveBeenCalled();
        expect(writeAutomationOutputFile).not.toHaveBeenCalled();
    } finally {
        save.mockRestore();
    }
});

test("completion reports a citation failure without throwing into job retries", async () => {
    const save = jest
        .spyOn(automationRunTask, "saveAutomationResult")
        .mockRejectedValueOnce(
            Object.assign(new Error("HTML citations need links"), {
                code: "HTML_CITATION_FORMAT",
            }),
        );
    try {
        await expect(
            automationRunTask.handleCompletion(
                "task",
                { summary: "done" },
                {},
                { userId: "user", automationId: "automation" },
            ),
        ).resolves.toEqual({ error: "HTML citations need links" });
        expect(writeAutomationOutputFile).not.toHaveBeenCalled();
    } finally {
        save.mockRestore();
    }
});

test.each(["html", "widgetHtml"])(
    "invalid %s prevents all output writes and latest-run updates",
    async (field) => {
        await expect(
            automationRunTask.saveAutomationResult({
                taskId: "task",
                userId: "user",
                metadata: { automationId: "automation" },
                rawResult: {
                    summary: "Summary :cd_source[id]",
                    html: "<p>Full report</p>",
                    widgetHtml: "<p>Widget</p>",
                    [field]: "<p>:cd_source[id]</p>",
                },
                tool: JSON.stringify({
                    citations: [
                        { searchResultId: "id", url: "https://example.com" },
                    ],
                }),
            }),
        ).rejects.toMatchObject({ code: "HTML_CITATION_FORMAT" });
        expect(writeAutomationOutputFile).not.toHaveBeenCalled();
        expect(Task.findByIdAndUpdate).not.toHaveBeenCalled();
        expect(Automation.findByIdAndUpdate).not.toHaveBeenCalled();
    },
);

test("valid HTML links save both files and keep Markdown citation metadata", async () => {
    const tool = JSON.stringify({
        citations: [{ searchResultId: "id", url: "https://example.com" }],
    });
    const result = await automationRunTask.saveAutomationResult({
        taskId: "task",
        userId: "user",
        metadata: { automationId: "automation" },
        rawResult: {
            summary: "Summary :cd_source[id]",
            html: '<p>Claim <a href="https://example.com">Source</a></p>',
            widgetHtml: '<a href="https://example.com">Source</a>',
        },
        tool,
    });
    expect(writeAutomationOutputFile).toHaveBeenCalledTimes(2);
    expect(result.summary).toBe("Summary :cd_source[id]");
    expect(result.tool).toBe(tool);
});
