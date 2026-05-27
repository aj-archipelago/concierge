import {
    getProviderFromModelId,
    resolveAgentModelForSend,
} from "./modelMetadata";

const agentModels = [
    {
        modelId: "cortex-agent-chat",
        displayName: "Fastest Large Model",
        provider: "cortex",
        isAgentic: true,
        isModelGroup: true,
        isDefault: true,
    },
    {
        modelId: "claude-46-opus-vertex",
        displayName: "Claude 4.6 Opus",
        provider: "anthropic",
        isAgentic: true,
    },
    {
        modelId: "claude-47-opus-vertex",
        displayName: "Claude 4.7 Opus",
        provider: "anthropic",
        isAgentic: true,
    },
    {
        modelId: "claude-46-sonnet-vertex",
        displayName: "Claude 4.6 Sonnet",
        provider: "anthropic",
        isAgentic: true,
    },
    {
        modelId: "oai-gpt54",
        displayName: "GPT 5.4",
        provider: "openai",
        isAgentic: true,
    },
    {
        modelId: "oai-gpt55",
        displayName: "GPT 5.5",
        provider: "openai",
        isAgentic: true,
    },
    {
        modelId: "xai-grok-4-3",
        displayName: "Grok 4.3",
        provider: "xai",
        isAgentic: true,
    },
    {
        modelId: "xai-grok-4-99",
        displayName: "Grok 4.99",
        provider: "xai",
        isAgentic: true,
    },
];

describe("resolveAgentModelForSend", () => {
    it("keeps an accepted agent model unchanged", () => {
        expect(
            resolveAgentModelForSend(
                "claude-47-opus-vertex",
                agentModels,
                {},
                "cortex-agent-chat",
            ),
        ).toBe("claude-47-opus-vertex");
    });

    it("uses metadata redirects when the target is accepted", () => {
        expect(
            resolveAgentModelForSend(
                "claude-3-opus-vertex",
                agentModels,
                { "claude-3-opus-vertex": "claude-46-opus-vertex" },
                "cortex-agent-chat",
            ),
        ).toBe("claude-46-opus-vertex");
    });

    it("uses metadata redirects for the Grok 4 alias", () => {
        expect(
            resolveAgentModelForSend(
                "xai-grok-4",
                agentModels,
                { "xai-grok-4": "xai-grok-4-3" },
                "cortex-agent-chat",
            ),
        ).toBe("xai-grok-4-3");
    });

    it("maps a stale same-vendor model to the latest accepted matching family", () => {
        expect(
            resolveAgentModelForSend(
                "claude-41-opus-vertex",
                agentModels,
                {},
                "cortex-agent-chat",
            ),
        ).toBe("claude-47-opus-vertex");
    });

    it("maps a stale OpenAI GPT model to the latest accepted GPT model", () => {
        expect(
            resolveAgentModelForSend(
                "oai-gpt51",
                agentModels,
                {},
                "cortex-agent-chat",
            ),
        ).toBe("oai-gpt55");
    });

    it("falls back to the system default when no vendor-family match exists", () => {
        expect(
            resolveAgentModelForSend(
                "unknown-legacy-model",
                agentModels,
                {},
                "cortex-agent-chat",
            ),
        ).toBe("cortex-agent-chat");
    });

    it("uses the system default when accepted agent models have not loaded", () => {
        expect(
            resolveAgentModelForSend(
                "claude-41-opus-vertex",
                undefined,
                {},
                "cortex-agent-chat",
            ),
        ).toBe("cortex-agent-chat");
    });
});

describe("getProviderFromModelId", () => {
    it("infers xAI for Grok aliases before metadata has resolved them", () => {
        expect(getProviderFromModelId("xai-grok-4", agentModels)).toBe("xai");
    });
});
