/**
 * @jest-environment node
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("automation agent MCP wiring", () => {
    it("keeps the worker sys_entity_agent query compatible with MCP variables", () => {
        const graphqlSource = read("jobs/graphql.mjs");

        expect(graphqlSource).toContain("$mcpConfig: String");
        expect(graphqlSource).toContain("$mcpAvailableServers: String");
        expect(graphqlSource).toContain("mcpConfig: $mcpConfig");
        expect(graphqlSource).toContain(
            "mcpAvailableServers: $mcpAvailableServers",
        );
    });

    it("passes user MCP config into automation sys_entity_agent calls", () => {
        const taskSource = read("jobs/tasks/automation-run.mjs");

        expect(taskSource).toContain("buildMcpAgentConfigForUser");
        expect(taskSource).toContain('logPrefix: "[MCP:automation]"');
        expect(taskSource).toContain("headless: true");
        expect(taskSource).toContain("mcpConfig: mcpAgentConfig.mcpConfig");
        expect(taskSource).toContain(
            "mcpAvailableServers: mcpAgentConfig.mcpAvailableServers",
        );
    });

    it("starts automation agent runs as streamed async Cortex requests", () => {
        const taskSource = read("jobs/tasks/automation-run.mjs");

        expect(taskSource).toContain("StreamAccumulator");
        expect(taskSource).toContain("stream: true");
        expect(taskSource).toContain(
            "const subscriptionId = result.data?.sys_entity_agent?.result",
        );
        expect(taskSource).toContain("return subscriptionId");
        expect(taskSource).toContain("async handleProgress(");
        expect(taskSource).toContain("async handleCompletion(");
        expect(taskSource).not.toContain("stream: false");
    });

    it("passes automation files as Cortex attachments instead of text-only prompt snippets", () => {
        const taskSource = read("jobs/tasks/automation-run.mjs");

        expect(taskSource).toContain("prepareFileContentForLLM");
        expect(taskSource).toContain("buildAutomationFileContext");
        expect(taskSource).toContain("...fileContext.fileContent");
        expect(taskSource).toContain('kind: "user-files"');
        expect(taskSource).not.toContain("TEXT_FILE_EXTENSIONS");
        expect(taskSource).not.toContain("readBlobContent");
    });

    it("attaches the previous HTML output with previous-run context", () => {
        const taskSource = read("jobs/tasks/automation-run.mjs");

        expect(taskSource).toContain("previous-run-output.html");
        expect(taskSource).toContain("previous_run_output");
        expect(taskSource).toContain("prepareExistingAutomationFileReference");
        expect(taskSource).toContain("checkMediaFile");
        expect(taskSource).toContain(
            "The previous run's HTML output is attached",
        );
        expect(taskSource).toContain("latestHtmlOutputPath");
    });
});
