import mongoose from "mongoose";
import LLM from "./app/api/models/llm";
import config from "./config/index";
import Prompt from "./app/api/models/prompt";
import App, { APP_TYPES } from "./app/api/models/app";
import User from "./app/api/models/user.mjs";
import { migrateStyleGuideFiles } from "./app/api/utils/style-guide-migration";
import {
    ensureUniqueActiveAppletAppIndex,
    repairDuplicateAppletApps,
} from "./app/api/canvas-applets/app-records";
import {
    BUILT_IN_NATIVE_APPS,
    ensureBuiltInNativeApps,
} from "./app/api/apps/native-apps";
import { runStartupMigrations } from "./app/api/utils/startup-migrations.mjs";

// Add a new id when a bootstrap task must run again for a later release.
const STARTUP_MIGRATIONS = [
    {
        id: "20240601_migrate_llms_to_model_ids",
        name: "Migrate prompt LLM references to model IDs",
        run: migrateLLMsToModelIds,
    },
    {
        id: "20260614_repair_applet_app_records",
        name: "Repair applet app records and active index",
        run: repairAppletAppRecords,
    },
    {
        id: "20260618_seed_builtin_native_apps",
        name: "Seed built-in native apps",
        run: seedNativeApps,
    },
    {
        id: "20240601_migrate_style_guide_files",
        name: "Migrate style guide files",
        run: migrateStyleGuideFilesForStartup,
    },
];

export async function register() {
    if (!mongoose?.connect) return;
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const { connectToDatabase } = await import("./src/db.mjs");
    await connectToDatabase();

    console.log("Connected to MongoDB");
    config.global.initialize();
    await runCriticalStartupMigrations();
    runNonCriticalStartupMigrations();
}

async function runCriticalStartupMigrations() {
    const criticalMigrations = STARTUP_MIGRATIONS.filter(
        (migration) => migration.critical,
    );
    if (criticalMigrations.length === 0) return;

    console.log("Running critical startup bootstrap");
    await runStartupMigrations(criticalMigrations);
}

function runNonCriticalStartupMigrations() {
    const nonCriticalMigrations = STARTUP_MIGRATIONS.filter(
        (migration) => !migration.critical,
    );
    if (nonCriticalMigrations.length === 0) return;

    console.log("Starting background startup bootstrap");
    runStartupMigrations(nonCriticalMigrations).catch((error) => {
        console.error("Background startup bootstrap error:", error);
    });
}

export async function repairAppletAppRecords() {
    const result = await repairDuplicateAppletApps();
    if (result.duplicateAppletCount > 0) {
        console.log(
            `Repaired ${result.duplicateAppletCount} duplicate applet app group(s); deactivated ${result.deactivatedAppCount} duplicate app record(s)`,
        );
    }
    await ensureUniqueActiveAppletAppIndex();
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

    await ensureBuiltInNativeApps({ author: systemUser._id });

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

    console.log(`Seeded ${BUILT_IN_NATIVE_APPS.length} native apps`);
}

export async function migrateStyleGuideFilesForStartup() {
    const result = await migrateStyleGuideFiles();

    if (result.migrated > 0 || result.errors > 0) {
        console.log(
            `Style guide migration: ${result.migrated} migrated, ${result.errors} errors`,
        );
    }

    if (result.errors > 0) {
        throw new Error(
            `Style guide migration completed with ${result.errors} error(s)`,
        );
    }

    return result;
}
