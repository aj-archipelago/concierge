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

    // Get all cortexModelNames from config
    const configModelNames = config.data.llms
        .map((llm) => llm.cortexModelName)
        .filter(Boolean);

    const llmsMissingFromConfig = await LLM.find({
        cortexModelName: { $nin: configModelNames },
    });

    if (llmsMissingFromConfig.length > 0) {
        console.log(
            `Found ${llmsMissingFromConfig.length} LLMs missing from config.`,
        );

        const llmIdsToFixup = llmsMissingFromConfig.map((llm) => llm._id);

        const promptsToFixup = await Prompt.find({
            llm: { $in: llmIdsToFixup },
        });

        console.log(
            `Found ${promptsToFixup.length} prompts referencing LLMs that don't exist in config. These will be updated to use the default LLM.`,
        );

        await Promise.all(
            promptsToFixup.map((prompt) => {
                prompt.llm = defaultLLM._id;
                return prompt.save();
            }),
        );

        // Delete LLMs that don't exist in config
        await LLM.deleteMany({
            cortexModelName: { $nin: configModelNames },
        });
    }

    // Update or insert existing LLMs
    for (const llm of config.data.llms) {
        await LLM.findOneAndUpdate(
            { cortexModelName: llm.cortexModelName },
            llm,
            { upsert: true },
        );
    }
}
