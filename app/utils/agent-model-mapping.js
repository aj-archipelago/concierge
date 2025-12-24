/**
 * Mapping of display names to model IDs for agent model selection
 * Display names are user-friendly, model IDs are what we send to GraphQL
 * provider indicates which icon to show
 */
export const AGENT_MODEL_OPTIONS = [
    { displayName: "GPT 5.2", modelId: "oai-gpt52", provider: "openai" },
    { displayName: "GPT 5.1", modelId: "oai-gpt51", provider: "openai" },
    { displayName: "GPT 4.1", modelId: "oai-gpt41", provider: "openai" },
    { displayName: "O3", modelId: "oai-o3", provider: "openai" },
    {
        displayName: "Claude 4.5 Sonnet",
        modelId: "claude-45-sonnet-vertex",
        provider: "anthropic",
    },
    {
        displayName: "Claude 4.1 Opus",
        modelId: "claude-41-opus-vertex",
        provider: "anthropic",
    },
    {
        displayName: "Grok 4.1 Fast Reasoning",
        modelId: "xai-grok-4-1-fast-reasoning",
        provider: "xai",
    },
    {
        displayName: "Gemini 3 Flash",
        modelId: "gemini-flash-3-vision",
        provider: "google",
    },
    {
        displayName: "Gemini 3 Pro",
        modelId: "gemini-pro-3-vision",
        provider: "google",
    },
];

/**
 * Get provider for a model ID
 */
export function getProviderFromModelId(modelId) {
    const option = AGENT_MODEL_OPTIONS.find((opt) => opt.modelId === modelId);
    return option?.provider || "openai"; // default
}

/**
 * Get model ID from display name
 */
export function getModelIdFromDisplayName(displayName) {
    const option = AGENT_MODEL_OPTIONS.find(
        (opt) => opt.displayName === displayName,
    );
    return option?.modelId || "oai-gpt51"; // default
}

/**
 * Get display name from model ID
 */
export function getDisplayNameFromModelId(modelId) {
    const option = AGENT_MODEL_OPTIONS.find((opt) => opt.modelId === modelId);
    return option?.displayName || "GPT 5.1"; // default
}

/**
 * Default agent model
 */
export const DEFAULT_AGENT_MODEL = "oai-gpt51";
