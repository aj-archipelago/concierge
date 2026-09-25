import { usesCompanion } from "../mcpConnectionRoute";

describe("connector routing", () => {
    it.each([
        "http://localhost:3001/mcp",
        "http://127.0.0.1/mcp",
        "http://10.2.3.4/mcp",
        "https://editor.local/mcp",
        "http://studio/mcp",
        "http://[::1]/mcp",
        "http://[fd00::1]/mcp",
        "http://[::ffff:127.0.0.1]/mcp",
        "https://100.64.1.2/mcp",
    ])("routes %s through the computer", (url) => {
        expect(usesCompanion(url)).toBe(true);
    });
    it.each([
        "https://mcp.slack.com/mcp",
        "https://localhost.evil.example/mcp",
        "https://example.com/mcp",
        "https://[2001:db8::1]/mcp",
        "invalid",
    ])("keeps %s on the cloud path", (url) => {
        expect(usesCompanion(url)).toBe(false);
    });
});
