import Prompt from "../models/prompt";

/**
 * Get prompt config with model and pathway info.
 * No LLM collection lookup — prompt.llm is a cortex model ID string.
 *
 * @param {string} promptId - The prompt ID
 * @param {string} defaultModel - Fallback cortex model ID
 * @returns {Object|null} { prompt, model, agentMode, reasoningEffort, pathwayName }
 */
export async function getPromptConfig(promptId, defaultModel) {
    const prompt = await Prompt.findById(promptId).populate("files");
    if (!prompt) {
        return null;
    }

    const model = prompt.llm || defaultModel;
    const agentMode = prompt.agentMode || false;
    const reasoningEffort = prompt.reasoningEffort || null;
    const pathwayName = agentMode
        ? "run_workspace_agent"
        : "run_workspace_prompt";

    return { prompt, model, agentMode, reasoningEffort, pathwayName };
}
