/** @jest-environment node */
import automationRunTask from "../tasks/automation-run.mjs";
import Automation from "../../app/api/models/automation.js";
import Task from "../../app/api/models/task.mjs";
import User from "../../app/api/models/user.mjs";
import {
    prepareAssistantTurn,
    parkAssistantTurn,
} from "../../app/api/utils/assistant-coordination.mjs";
import { writeAutomationOutputFile } from "../../app/api/automations/utils.js";
import {
    readTaskOutputFile,
    TASK_HTML_OUTPUT_ERROR,
} from "../../app/api/utils/task-html-output.mjs";
jest.mock("../../app/api/utils/assistant-coordination.mjs", () => ({
    prepareAssistantTurn: jest.fn(async (_task, _entity, prompt) => ({
        turn: 0,
        prompt,
    })),
    parkAssistantTurn: jest.fn(async () => false),
}));
jest.mock("../../app/api/utils/agent-tool-capabilities.mjs", () => ({
    issueAgentToolsToken: jest.fn(async () => "test-token"),
}));
jest.mock("../../app/api/utils/colleagues.js", () => ({}));

jest.mock("../../app/api/models/automation.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), findByIdAndUpdate: jest.fn() },
}));
jest.mock("../../app/api/models/task.mjs", () => ({
    __esModule: true,
    default: { findByIdAndUpdate: jest.fn(), findOne: jest.fn() },
}));
jest.mock("../../app/api/models/user.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../graphql.mjs", () => ({
    QUERIES: { SYS_ENTITY_AGENT: "agent-query" },
}));
jest.mock("../../app/api/utils/shareAccess.js", () => ({}));
jest.mock("../../app/api/utils/media-service-utils.js", () => ({}));
jest.mock("../../app/api/utils/llm-file-utils.js", () => ({
    prepareFileContentForLLM: jest.fn(async () => []),
}));
jest.mock("../../app/api/utils/mcp-agent-config.js", () => ({
    buildMcpAgentConfigForUser: jest.fn(async () => ({})),
}));
jest.mock("../../app/api/automations/utils.js", () => ({
    ...jest.requireActual("../../app/api/automations/utils.js"),
    writeAutomationOutputFile: jest.fn(
        async ({ taskId, filename }) =>
            `automations/brief/outputs/${taskId}/${filename}`,
    ),
    listAutomationSupportingFiles: jest.fn(async () => []),
    readAutomationContent: jest.fn(async () => "Make a report."),
}));
jest.mock("../../app/api/utils/task-html-output.mjs", () => ({
    ...jest.requireActual("../../app/api/utils/task-html-output.mjs"),
    readTaskOutputFile: jest.fn(),
}));

const attempt = "12345678-1234-1234-1234-123456789abc";
const metadata = {
    automationId: "automation",
    automationSlug: "brief",
    outputAttemptId: attempt,
    userId: "user",
};
const directory = `automations/brief/outputs/run/draft-${attempt}`;
const report =
    "<html><body><h1>Report</h1><p>Today's result.</p></body></html>";

beforeEach(() => {
    jest.clearAllMocks();
    Automation.findOne.mockResolvedValue({
        _id: "automation",
        name: "Brief",
        slug: "brief",
        producesHtml: true,
        enabled: false,
    });
    Automation.findByIdAndUpdate.mockResolvedValue({});
    Task.findByIdAndUpdate.mockResolvedValue({});
    Task.findOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    User.findById.mockResolvedValue({ _id: "user", contextId: "user-context" });
    readTaskOutputFile.mockResolvedValue(null);
});

test("a placeholder response publishes the saved report and records its provenance", async () => {
    readTaskOutputFile.mockImplementation(async (path) =>
        path === `${directory}/result.json`
            ? JSON.stringify({
                  summary: "Ready",
                  html: report,
                  widgetHtml: "<p>Brief</p>",
              })
            : null,
    );
    const result = await automationRunTask.saveAutomationResult({
        taskId: "run",
        userId: "user",
        metadata,
        rawResult: JSON.stringify({
            html: "<!doctype html>... (complete document written to output.json)",
        }),
    });
    expect(writeAutomationOutputFile).toHaveBeenCalledTimes(2);
    expect(writeAutomationOutputFile).toHaveBeenCalledWith(
        expect.objectContaining({
            taskId: "run",
            filename: "index.html",
            content: expect.stringContaining("Today's result"),
        }),
    );
    expect(result.outputPublishing.source).toBe(`${directory}/result.json`);
    expect(JSON.parse(result.result).html).toContain("Today's result");
    expect(result.result).not.toContain("written to output.json");
    expect(Automation.findByIdAndUpdate).toHaveBeenCalledWith(
        "automation",
        expect.objectContaining({
            $set: expect.objectContaining({ latestRunTaskId: "run" }),
        }),
    );
});

test("missing valid output does not write files or replace the previous report", async () => {
    await expect(
        automationRunTask.saveAutomationResult({
            taskId: "run",
            userId: "user",
            metadata,
            rawResult: "Done. Saved to scratch/output.json.",
        }),
    ).rejects.toMatchObject({ code: TASK_HTML_OUTPUT_ERROR });
    expect(writeAutomationOutputFile).not.toHaveBeenCalled();
    expect(Task.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(Automation.findByIdAndUpdate).not.toHaveBeenCalled();
});

test("a publishing failure is returned without throwing into agent retries", async () => {
    await expect(
        automationRunTask.handleCompletion("run", "Done.", {}, metadata),
    ).resolves.toEqual({
        error: expect.stringContaining("previous report was kept"),
    });
    expect(writeAutomationOutputFile).not.toHaveBeenCalled();
    expect(Automation.findByIdAndUpdate.mock.calls).toEqual([
        ["automation", { $unset: { schedulerLockedAt: 1 } }],
    ]);
});

test("invalid widget HTML falls back to the valid full report", async () => {
    const result = await automationRunTask.saveAutomationResult({
        taskId: "run",
        userId: "user",
        metadata,
        rawResult: JSON.stringify({
            html: report,
            widgetHtml: "<!doctype html>...",
        }),
    });
    expect(writeAutomationOutputFile).toHaveBeenCalledTimes(1);
    expect(result.outputPublishing.widgetOmitted).toBe(true);
    expect(Automation.findByIdAndUpdate).toHaveBeenCalledWith(
        "automation",
        expect.objectContaining({ $unset: { latestWidgetHtmlOutputPath: 1 } }),
    );
});

test("plain-text automations retain their existing result behavior", async () => {
    Automation.findOne.mockResolvedValue({
        _id: "automation",
        slug: "brief",
        producesHtml: false,
    });
    const result = await automationRunTask.saveAutomationResult({
        taskId: "run",
        userId: "user",
        metadata,
        rawResult: "No updates today.",
    });
    expect(result.result).toBe("No updates today.");
    expect(readTaskOutputFile).not.toHaveBeenCalled();
});

test("each start gets a fresh persisted destination and gives its cloud path to the agent", async () => {
    const job = {
        data: {
            taskId: "run",
            userId: "user",
            metadata: { automationId: "automation" },
        },
        client: {
            query: jest.fn(async () => ({
                data: { sys_entity_agent: { result: "request" } },
            })),
        },
    };
    await automationRunTask.startRequest(job);
    const first = job.data.metadata.outputAttemptId;
    await automationRunTask.startRequest(job);
    const second = job.data.metadata.outputAttemptId;
    expect(first).not.toBe(second);
    expect(job.data.metadata.outputAttemptIds).toEqual([first, second]);
    expect(Task.findByIdAndUpdate).toHaveBeenCalledWith(
        "run",
        expect.objectContaining({
            $set: expect.objectContaining({
                metadata: expect.objectContaining({ outputAttemptId: second }),
            }),
        }),
    );
    const prompt =
        job.client.query.mock.calls[1][0].variables.chatHistory[1].content.join(
            "\n",
        );
    expect(prompt).toContain(
        `/workspace/files/automations/brief/outputs/run/draft-${second}`,
    );
    expect(prompt).not.toContain(first);
});

test("a resumed turn receives the current output destination above its old brief", async () => {
    prepareAssistantTurn.mockResolvedValueOnce({
        turn: 1,
        prompt: "Earlier handoff: /workspace/files/automations/brief/outputs/run/draft-old/result.json",
    });
    const job = {
        data: {
            taskId: "run",
            userId: "user",
            metadata: { automationId: "automation", outputAttemptId: attempt },
        },
        client: {
            query: jest.fn(async () => ({
                data: { sys_entity_agent: { result: "request" } },
            })),
        },
    };
    await automationRunTask.startRequest(job);
    const messages = job.client.query.mock.calls[0][0].variables.chatHistory;
    expect(messages[0].content.join("\n")).toContain(
        `/workspace/files/automations/brief/outputs/run/draft-${job.data.metadata.outputAttemptId}`,
    );
    expect(messages[0].content.join("\n")).toContain("supersedes");
    expect(messages[1].content.join("\n")).toContain("draft-old");
});

test("waiting tasks do not publish partial files", async () => {
    parkAssistantTurn.mockResolvedValueOnce(true);
    expect(
        await automationRunTask.handleCompletion(
            "run",
            "Waiting",
            {},
            metadata,
        ),
    ).toEqual({ assistantWaiting: true });
    expect(readTaskOutputFile).not.toHaveBeenCalled();
    expect(writeAutomationOutputFile).not.toHaveBeenCalled();
});

test("recovered file output passes citation validation before any write", async () => {
    readTaskOutputFile.mockResolvedValueOnce(
        JSON.stringify({
            html: "<p>Claim :cd_source[source-id]</p>",
            widgetHtml: "<p>Brief</p>",
        }),
    );
    await expect(
        automationRunTask.saveAutomationResult({
            taskId: "run",
            userId: "user",
            metadata,
            rawResult: "Written to file.",
        }),
    ).rejects.toMatchObject({ code: "HTML_CITATION_FORMAT" });
    expect(writeAutomationOutputFile).not.toHaveBeenCalled();
    expect(Automation.findByIdAndUpdate).not.toHaveBeenCalled();
});
