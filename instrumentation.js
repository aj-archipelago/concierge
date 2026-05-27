import mongoose from "mongoose";
import LLM from "./app/api/models/llm";
import config from "./config/index";
import { connectToDatabase } from "./src/db.mjs";
import Prompt from "./app/api/models/prompt";
import App, { APP_STATUS, APP_TYPES } from "./app/api/models/app";
import User from "./app/api/models/user.mjs";
import { migrateStyleGuideFiles } from "./app/api/utils/style-guide-migration";

export async function register() {
    if (!mongoose?.connect) return;
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    await connectToDatabase();

    console.log("Connected to MongoDB");
    console.log("Running migrations");
    await migrateLLMsToModelIds();

    // Seed native apps
    await seedNativeApps();

    // Ensure style guide files are available in the correct context
    migrateStyleGuideFiles()
        .then((result) => {
            if (result.migrated > 0 || result.errors > 0) {
                console.log(
                    `Style guide migration: ${result.migrated} migrated, ${result.errors} errors`,
                );
            }
        })
        .catch((error) => {
            console.error("Style guide migration error:", error);
        });

    config.global.initialize();
}

/**
 * One-time migration: convert prompt.llm from LLM ObjectId → cortex model ID string.
 * Also migrates conciergeagent/conciergeresearchagent to agentMode.
 * After running, cleans up the LLM collection.
 * Subsequent boots find no ObjectIds and no LLMs — this is a no-op.
 */
export async function migrateLLMsToModelIds() {
    const defaultModel = config.cortex.defaultChatModel;

    const prompts = await Prompt.find({});
    let migratedCount = 0;

    for (const prompt of prompts) {
        if (!prompt.llm) continue;
        const updates = {};

        // If llm is a valid ObjectId, resolve to cortex model name
        if (mongoose.isValidObjectId(prompt.llm)) {
            const llm = await LLM.findOne({ _id: prompt.llm });
            if (llm) {
                if (llm.identifier === "conciergeresearchagent") {
                    updates.llm = defaultModel;
                    updates.agentMode = true;
                    updates.reasoningEffort = "high";
                } else if (llm.identifier === "conciergeagent") {
                    updates.llm = defaultModel;
                    updates.agentMode = true;
                } else {
                    updates.llm = llm.cortexModelName;
                }
            } else {
                updates.llm = defaultModel;
            }
        }

        if (Object.keys(updates).length > 0) {
            await Prompt.findByIdAndUpdate(prompt._id, updates);
            migratedCount++;
        }
    }

    if (migratedCount > 0) {
        console.log(
            `Migrated ${migratedCount} prompts from LLM ObjectIds to cortex model IDs`,
        );
    }

    // Clean up LLM collection — no longer needed
    const llmCount = await LLM.countDocuments();
    if (llmCount > 0) {
        await LLM.deleteMany({});
        console.log(`Cleaned up ${llmCount} LLM documents`);
    }
}

export async function seedNativeApps() {
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

    // Remove retired native apps and clean up user references
    const retiredSlugs = ["applets-v2"];
    const retired = await App.find({
        slug: { $in: retiredSlugs },
        type: APP_TYPES.NATIVE,
    });
    if (retired.length) {
        const retiredIds = retired.map((a) => a._id);
        await User.updateMany(
            { "apps.appId": { $in: retiredIds } },
            { $pull: { apps: { appId: { $in: retiredIds } } } },
        );
        await App.deleteMany({ _id: { $in: retiredIds } });
        console.log(`Removed ${retired.length} retired native apps`);
    }

    console.log(`Seeded ${nativeApps.length} native apps`);
}
