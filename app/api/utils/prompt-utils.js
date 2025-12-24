import LLM from "../models/llm";
import Prompt from "../models/prompt";
import { getLLMWithFallback } from "./llm-file-utils";

// LLM identifiers that need migration to agentMode
const LEGACY_AGENT_IDENTIFIERS = ["labeebagent", "labeebresearchagent"];

/**
 * Migrates a prompt if it uses legacy labeeb agent LLMs.
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
                researchMode: llm.identifier === "labeebresearchagent",
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
        pathwayName = researchMode
            ? "run_labeeb_research_agent"
            : "run_labeeb_agent";
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
