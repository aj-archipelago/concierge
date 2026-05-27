import LLM from "../models/llm";
import Prompt from "../models/prompt";
import { getLLMWithFallback } from "./llm-file-utils";

// LLM identifiers that need migration to agentMode.
const LEGACY_AGENT_IDENTIFIERS = ["conciergeagent", "conciergeresearchagent"];

/**
 * Migrates a prompt if it uses legacy Concierge agent LLMs.
 * Updates the prompt in the database and returns the migrated prompt with its LLM.
 *
 * @param {string} promptId - The prompt ID
 * @returns {Object} { prompt, llm, agentMode, researchMode, pathwayName, model }
 */
export async function getPromptWithMigration(promptId) {
    let prompt = await Prompt.findById(promptId).populate("files");
    if (!prompt) {
        return null;
    }

    let llm = await getLLMWithFallback(LLM, prompt.llm);

    // Migration: If LLM is a legacy agent, migrate on the spot
    if (LEGACY_AGENT_IDENTIFIERS.includes(llm.identifier)) {
        const defaultLLM =
            (await LLM.findOne({ identifier: "gpt51" })) ||
            (await LLM.findOne({ isDefault: true }));

        if (defaultLLM) {
            const migrationUpdate = {
                llm: defaultLLM._id,
                agentMode: true,
                researchMode: llm.identifier === "conciergeresearchagent",
            };

            await Prompt.findByIdAndUpdate(promptId, migrationUpdate);
            prompt = await Prompt.findById(promptId).populate("files");
            llm = await getLLMWithFallback(LLM, prompt.llm);
        }
    }

    const agentMode = prompt.agentMode || false;
    const researchMode = prompt.researchMode || false;

    let pathwayName;
    let model;

    if (agentMode) {
        // All agent modes use run_workspace_agent; researchMode is passed as a parameter
        pathwayName = "run_workspace_agent";
        model = llm.cortexModelName;
    } else {
        pathwayName = llm.cortexPathwayName;
        model = llm.cortexModelName;
    }

    return {
        prompt,
        llm,
        agentMode,
        researchMode,
        pathwayName,
        model,
    };
}

/**
 * Get prompt config with model and pathway info.
 * No LLM collection lookup: prompt.llm is a Cortex model ID string.
 *
 * @param {string} promptId
 * @param {string} defaultModel
 * @returns {Promise<Object|null>} { prompt, model, agentMode, reasoningEffort, pathwayName }
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
