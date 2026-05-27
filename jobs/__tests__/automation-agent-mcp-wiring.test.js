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
});
