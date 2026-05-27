/**
 * @jest-environment node
 */

const { validateMcpServerUrl } = require("../mcpUrlValidation.js");

describe("validateMcpServerUrl", () => {
    const originalEnv = process.env;
    const scriptProtocol = "javascript";

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.MCP_ALLOW_PRIVATE_URLS;
        process.env.NODE_ENV = "test";
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it("rejects empty / non-string input", () => {
        expect(validateMcpServerUrl("").ok).toBe(false);
        expect(validateMcpServerUrl(null).ok).toBe(false);
        expect(validateMcpServerUrl(undefined).ok).toBe(false);
        expect(validateMcpServerUrl(123).ok).toBe(false);
    });

    it("rejects malformed URLs", () => {
        expect(validateMcpServerUrl("not a url").ok).toBe(false);
        expect(validateMcpServerUrl("ftp://example.com").ok).toBe(false);
        expect(validateMcpServerUrl(`${scriptProtocol}:alert(1)`).ok).toBe(
            false,
        );
        expect(validateMcpServerUrl("file:///etc/passwd").ok).toBe(false);
    });

    it("accepts public https/http URLs", () => {
        expect(validateMcpServerUrl("https://example.com/mcp").ok).toBe(true);
        expect(validateMcpServerUrl("http://example.com/mcp").ok).toBe(true);
        expect(validateMcpServerUrl("https://api.github.com").ok).toBe(true);
    });

    it("blocks localhost variants", () => {
        expect(validateMcpServerUrl("http://localhost:8080").ok).toBe(false);
        expect(validateMcpServerUrl("http://LOCALHOST/mcp").ok).toBe(false);
        expect(validateMcpServerUrl("http://api.localhost").ok).toBe(false);
    });

    it("blocks private IPv4 ranges", () => {
        expect(validateMcpServerUrl("http://127.0.0.1").ok).toBe(false);
        expect(validateMcpServerUrl("http://10.0.0.5").ok).toBe(false);
        expect(validateMcpServerUrl("http://10.255.255.255").ok).toBe(false);
        expect(validateMcpServerUrl("http://172.16.0.1").ok).toBe(false);
        expect(validateMcpServerUrl("http://172.31.255.1").ok).toBe(false);
        expect(validateMcpServerUrl("http://192.168.1.1").ok).toBe(false);
        expect(validateMcpServerUrl("http://0.0.0.0").ok).toBe(false);
        expect(validateMcpServerUrl("http://100.64.0.1").ok).toBe(false);
    });

    it("allows public IPv4 addresses outside private ranges", () => {
        expect(validateMcpServerUrl("http://172.32.0.1").ok).toBe(true);
        expect(validateMcpServerUrl("http://8.8.8.8").ok).toBe(true);
        expect(validateMcpServerUrl("http://172.15.0.1").ok).toBe(true);
    });

    it("blocks the AWS/GCP metadata endpoint", () => {
        expect(validateMcpServerUrl("http://169.254.169.254").ok).toBe(false);
        expect(
            validateMcpServerUrl("http://169.254.169.254/latest/meta-data").ok,
        ).toBe(false);
    });

    it("blocks IPv6 loopback / link-local / unique-local", () => {
        expect(validateMcpServerUrl("http://[::1]/").ok).toBe(false);
        expect(validateMcpServerUrl("http://[fe80::1]/").ok).toBe(false);
        expect(validateMcpServerUrl("http://[fc00::1]/").ok).toBe(false);
        expect(validateMcpServerUrl("http://[fd12::1]/").ok).toBe(false);
    });

    it("blocks IPv4-mapped IPv6 in private ranges", () => {
        expect(validateMcpServerUrl("http://[::ffff:127.0.0.1]/").ok).toBe(
            false,
        );
        expect(validateMcpServerUrl("http://[::ffff:10.0.0.1]/").ok).toBe(
            false,
        );
    });

    it("MCP_ALLOW_PRIVATE_URLS bypasses host blocking", () => {
        process.env.MCP_ALLOW_PRIVATE_URLS = "true";
        expect(validateMcpServerUrl("http://localhost:3000").ok).toBe(true);
        expect(validateMcpServerUrl("http://10.0.0.1").ok).toBe(true);
        expect(validateMcpServerUrl("http://127.0.0.1").ok).toBe(true);
    });

    it("requires https in production", () => {
        process.env.NODE_ENV = "production";
        expect(validateMcpServerUrl("http://example.com").ok).toBe(false);
        expect(validateMcpServerUrl("https://example.com").ok).toBe(true);
    });

    it("returns the parsed URL on success", () => {
        const result = validateMcpServerUrl("  https://example.com/mcp  ");
        expect(result.ok).toBe(true);
        expect(result.url).toBe("https://example.com/mcp");
    });
});
