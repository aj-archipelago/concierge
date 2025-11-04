import mongoose from "mongoose";
import LLM from "./app/api/models/llm";
import config from "./config/index";
import { connectToDatabase } from "./src/db.mjs";
import Prompt from "./app/api/models/prompt";
import App, { APP_STATUS, APP_TYPES } from "./app/api/models/app";
import User from "./app/api/models/user.mjs";

export async function register() {
    if (!mongoose?.connect) return;
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    await connectToDatabase();

    console.log("Connected to MongoDB");
    console.log("Seeding data");
    await seed();

    config.global.initialize();
}

export async function seed() {
    const defaultLLMConfig = config.data.llms.find((llm) => llm.isDefault);

    // one-time migration to assign identifiers based on
    // cortexModelName
    const llmsWithoutIdentifiers = await LLM.find({
        identifier: null,
    });

    if (llmsWithoutIdentifiers.length > 0) {
        await Promise.all(
            llmsWithoutIdentifiers.map(async (llm) => {
                const identifier = config.data.llms.find(
                    (llmFromConfig) =>
                        llmFromConfig.cortexModelName === llm.cortexModelName,
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

    // Get the actual default LLM document after upserting
    const defaultLLM = await LLM.findOne({
        identifier: defaultLLMConfig.identifier,
    });
    if (!defaultLLM) {
        throw new Error("Default LLM not found after upserting");
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

    // Seed native apps
    await seedNativeApps();
}

async function seedNativeApps() {
    // Get or create a system admin user for native apps
    let systemUser = await User.findOne({ role: "admin" });

    if (!systemUser) {
        // Create a system user if none exists
        systemUser = await User.create({
            userId: "system",
            username: "system",
            name: "System",
            contextId: "system",
            role: "admin",
        });
        console.log("Created system user for native apps");
    }

    // Define the main native apps based on navigation
    const nativeApps = [
        {
            name: "Translate",
            slug: "translate",
            type: APP_TYPES.NATIVE,
            icon: "Globe",
            description:
                "Translate text between multiple languages with AI-powered accuracy",
        },
        {
            name: "Transcribe",
            slug: "video",
            type: APP_TYPES.NATIVE,
            icon: "Video",
            description:
                "Transcribe and translate video and audio files with AI-powered accuracy",
        },
        {
            name: "Write",
            slug: "write",
            type: APP_TYPES.NATIVE,
            icon: "Pencil",
            description:
                "Write and edit content with AI-powered writing assistance",
        },
        {
            name: "Workspaces",
            slug: "workspaces",
            type: APP_TYPES.NATIVE,
            icon: "AppWindow",
            description:
                "Manage your AI workspaces and collaborate on projects",
        },
        {
            name: "Media",
            slug: "media",
            type: APP_TYPES.NATIVE,
            icon: "Image",
            description: "Generate and manage images and media content",
        },
        {
            name: "Jira",
            slug: "jira",
            type: APP_TYPES.NATIVE,
            icon: "Bug",
            description:
                "Integrate with Jira for issue tracking and project management",
        },
    ];

    // Upsert each native app
    for (const appData of nativeApps) {
        await App.findOneAndUpdate(
            {
                slug: appData.slug,
                type: APP_TYPES.NATIVE,
            },
            {
                ...appData,
                status: APP_STATUS.ACTIVE,
                author: systemUser._id,
            },
            {
                upsert: true,
                new: true,
            },
        );
    }

    console.log(`Seeded ${nativeApps.length} native apps`);
}
