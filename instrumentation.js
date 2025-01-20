import mongoose from "mongoose";
import LLM from "./app/api/models/llm";
import config from "./config/index";
import { connectToDatabase } from "./src/db.mjs";
import Prompt from "./app/api/models/prompt";

export async function register() {
    if (!mongoose?.connect) return;
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    await connectToDatabase();

    console.log("Connected to MongoDB");
    console.log("Seeding data");
    await seed();

    config.global.initialize();
}

async function seed() {
    const defaultLLM = config.data.llms.find((llm) => llm.isDefault);

    // one-time migration to assign identifiers based on
    // cortexModelName
    const llmsWithoutIdentifiers = await LLM.find({
        identifier: null,
    });

    if (llmsWithoutIdentifiers.length > 0) {
        await Promise.all(
            llmsWithoutIdentifiers.map(async (llm) => {
                const identifier = config.data.llms.find(
                    (llm) => llm.cortexModelName === llm.cortexModelName,
                )?.identifier;
                llm.identifier = identifier;
                return llm.save();
            }),
        );
    }

    // now that every LLM has an identifier, we can upsert them
    for (const llm of config.data.llms) {
        await LLM.findOneAndUpdate({ identifier: llm.identifier }, llm, {
            upsert: true,
        });
    }

    const modelIdentifiers = config.data.llms
        .map((llm) => llm.identifier)
        .filter(Boolean);

    const llmsMissingFromConfig = await LLM.find({
        identifier: { $nin: modelIdentifiers },
    });

    if (llmsMissingFromConfig.length > 0) {
        console.log(
            `Found ${llmsMissingFromConfig.length} LLMs missing from config.`,
        );

        const llmIdsToFixup = llmsMissingFromConfig.map((llm) => llm._id);

        const promptsToFixup = await Prompt.find({
            llm: { $in: llmIdsToFixup },
        });

        // Update prompts to use the default LLM
        // if they reference LLMs that don't exist in config
        if (promptsToFixup.length > 0) {
            console.log(
                `Found ${promptsToFixup.length} prompts referencing LLMs that don't exist in config. These will be updated to use the default LLM.`,
            );

            await Promise.all(
                promptsToFixup.map((prompt) => {
                    prompt.llm = defaultLLM._id;
                    return prompt.save();
                }),
            );

            console.log(
                `Updated ${promptsToFixup.length} prompts to use the default LLM.`,
            );
        }

        // Delete LLMs that don't exist in config
        await LLM.deleteMany({
            identifier: { $nin: modelIdentifiers },
        });

        console.log(
            `Deleted ${llmsMissingFromConfig.length} LLMs that don't exist in config.`,
        );
    }
}
