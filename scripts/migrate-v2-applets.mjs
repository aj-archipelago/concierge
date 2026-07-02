#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENV_FILES = [".env.local", ".env"];
const STALE_PENDING_MS = 10 * 60 * 1000;

function printUsage() {
    console.log(`Usage:
  node scripts/migrate-v2-applets.mjs [selector] [options]

Selectors:
  --workspace <id>   Migrate one workspace applet
  --applet <id>      Migrate one applet
  --all              Migrate all legacy workspace applets

Options:
  --dry-run          Print inventory and planned actions without writing
  --limit <n>        Limit batch size for --all
  --resume           Skip migrated applets and retry failed/stale pending applets
  --env-file <path>  Optional env file to read before connecting
  --help             Show this help text
`);
}

function parseArgs(argv) {
    const options = {
        dryRun: false,
        workspaceId: null,
        appletId: null,
        all: false,
        limit: null,
        resume: false,
        envFile: null,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case "--dry-run":
                options.dryRun = true;
                break;
            case "--workspace":
                options.workspaceId = argv[++index];
                break;
            case "--applet":
                options.appletId = argv[++index];
                break;
            case "--all":
                options.all = true;
                break;
            case "--limit":
                options.limit = Number(argv[++index]);
                break;
            case "--resume":
                options.resume = true;
                break;
            case "--env-file":
                options.envFile = argv[++index];
                break;
            case "--help":
            case "-h":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    const selectorCount = [
        Boolean(options.workspaceId),
        Boolean(options.appletId),
        options.all,
    ].filter(Boolean).length;
    if (!options.help && selectorCount !== 1) {
        throw new Error(
            "Choose exactly one selector: --workspace, --applet, or --all",
        );
    }
    if (
        options.limit != null &&
        (!Number.isInteger(options.limit) || options.limit < 1)
    ) {
        throw new Error("--limit must be a positive integer");
    }
    return options;
}

function resolvePath(filePath) {
    return path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);
}

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    const contents = fs.readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
        if (!line || line.trim().startsWith("#")) continue;
        const eqIndex = line.indexOf("=");
        if (eqIndex === -1) continue;
        const key = line.slice(0, eqIndex).trim();
        const rawValue = line.slice(eqIndex + 1).trim();
        if (!key || process.env[key] != null) continue;
        process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
    return true;
}

function loadEnv(options) {
    if (options.envFile) {
        loadEnvFile(resolvePath(options.envFile));
        return;
    }
    for (const file of DEFAULT_ENV_FILES) {
        loadEnvFile(path.resolve(process.cwd(), file));
    }
}

function idString(value) {
    return (
        value?._id?.toString?.() || value?.toString?.() || String(value || "")
    );
}

function sourceHtmlSummary(applet) {
    const versions = Array.isArray(applet?.htmlVersions)
        ? applet.htmlVersions
        : [];
    if (typeof applet?.html === "string" && applet.html.trim()) {
        return { source: "html", hasHtml: true };
    }
    const publishedIndex =
        typeof applet?.publishedVersionIndex === "number"
            ? applet.publishedVersionIndex
            : null;
    if (publishedIndex != null && versions[publishedIndex]) {
        return {
            source: versions[publishedIndex].contentBlobPath
                ? "published-external-version"
                : "published-inline-version",
            hasHtml: true,
        };
    }
    if (versions.length > 0) {
        const latest = versions[versions.length - 1];
        return {
            source: latest.contentBlobPath
                ? "latest-external-version"
                : "latest-inline-version",
            hasHtml: true,
        };
    }
    return { source: "empty-draft", hasHtml: false };
}

function shouldSkip(applet, options) {
    if (Number(applet?.version || 1) === 2 && applet?.filePath) {
        return "already-migrated";
    }
    if (applet?.migrationStatus === "pending" && !options.resume) {
        return "pending";
    }
    if (applet?.migrationStatus === "pending" && options.resume) {
        const updatedAt = applet?.updatedAt
            ? new Date(applet.updatedAt).getTime()
            : 0;
        if (Date.now() - updatedAt < STALE_PENDING_MS) {
            return "fresh-pending";
        }
    }
    return null;
}

async function buildInventory({ workspace, applet, models }) {
    const { App, AppletData, AppletFile, AppletSharedData } = models;
    const appletId = idString(applet);
    const app = await App.findOne({
        type: "applet",
        $or: [
            { appletId },
            ...(workspace?._id ? [{ workspaceId: workspace._id }] : []),
        ],
    }).lean();
    const [hasData, hasFiles, hasSharedData] = await Promise.all([
        AppletData.exists({ appletId }),
        AppletFile.exists({ appletId }),
        AppletSharedData.exists({ appletId }),
    ]);
    const html = sourceHtmlSummary(applet);

    return {
        workspaceId: workspace?._id ? idString(workspace._id) : null,
        workspaceName: workspace?.name || null,
        appletId,
        appletName: applet?.name || null,
        appletVersion: Number(applet?.version || 1),
        migrationStatus: applet?.migrationStatus || null,
        sourceHtml: html.source,
        versionCount: Array.isArray(applet?.htmlVersions)
            ? applet.htmlVersions.length
            : 0,
        publishedVersionIndex:
            typeof applet?.publishedVersionIndex === "number"
                ? applet.publishedVersionIndex
                : null,
        appStore: app
            ? {
                  appId: idString(app._id),
                  slug: app.slug || null,
                  hasAppletId: Boolean(app.appletId),
                  hasWorkspaceId: Boolean(app.workspaceId),
                  status: app.status || null,
              }
            : null,
        promptCount: Array.isArray(workspace?.prompts)
            ? workspace.prompts.length
            : 0,
        hasAppletData: Boolean(hasData),
        hasAppletFiles: Boolean(hasFiles),
        hasAppletSharedData: Boolean(hasSharedData),
        warnings: html.hasHtml
            ? []
            : [
                  "No recoverable applet HTML found; migration will create an empty Draft.",
              ],
    };
}

async function ownerUserForApplet(applet, User) {
    const user = await User.findById(applet.owner)
        .select("_id contextId")
        .lean();
    if (!user?._id || !user?.contextId) {
        throw new Error(
            `Owner user for applet ${idString(applet)} has no contextId`,
        );
    }
    return user;
}

async function loadTargets(options, models) {
    const { Workspace, Applet } = models;
    if (options.workspaceId) {
        const workspace = await Workspace.findById(
            options.workspaceId,
        ).populate("applet");
        if (!workspace?.applet) {
            throw new Error("Workspace applet not found");
        }
        return [{ workspace, applet: workspace.applet }];
    }
    if (options.appletId) {
        const applet = await Applet.findById(options.appletId);
        if (!applet) throw new Error("Applet not found");
        const workspace = await Workspace.findOne({ applet: applet._id });
        return [{ workspace, applet }];
    }

    let query = Workspace.find({ applet: { $exists: true, $ne: null } })
        .populate("applet")
        .sort({ updatedAt: 1 });
    if (options.limit) query = query.limit(options.limit);
    const workspaces = await query;
    return workspaces
        .filter((workspace) => workspace.applet)
        .map((workspace) => ({ workspace, applet: workspace.applet }));
}

function logJson(payload) {
    console.log(JSON.stringify(payload));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }

    loadEnv(options);
    const { default: mongoose } = await import("mongoose");
    const { connectToDatabase } = await import("../src/db.mjs");
    const { default: Workspace } = await import(
        "../app/api/models/workspace.js"
    );
    const { default: Applet } = await import("../app/api/models/applet.js");
    const { default: User } = await import("../app/api/models/user.mjs");
    const { default: App } = await import("../app/api/models/app.js");
    const { default: AppletData } = await import(
        "../app/api/models/applet-data.js"
    );
    const { default: AppletFile } = await import(
        "../app/api/models/applet-file.js"
    );
    const { default: AppletSharedData } = await import(
        "../app/api/models/applet-shared-data.js"
    );
    const { migrateWorkspaceAppletToV2 } = await import(
        "../app/api/canvas-applets/migration.js"
    );
    const models = {
        Workspace,
        Applet,
        User,
        App,
        AppletData,
        AppletFile,
        AppletSharedData,
    };

    await connectToDatabase();
    try {
        const targets = await loadTargets(options, models);
        for (const target of targets) {
            const applet = target.applet;
            const skipReason = shouldSkip(applet, options);
            const inventory = await buildInventory({ ...target, models });
            if (options.dryRun || skipReason) {
                logJson({
                    event: "inventory",
                    action: skipReason ? "skip" : "migrate",
                    skipReason,
                    dryRun: options.dryRun,
                    ...inventory,
                });
                continue;
            }

            try {
                const user = await ownerUserForApplet(applet, User);
                const result = await migrateWorkspaceAppletToV2({
                    workspaceId: target.workspace?._id
                        ? idString(target.workspace._id)
                        : null,
                    appletId: idString(applet),
                    user,
                });
                logJson({
                    event: "migrated",
                    appletId: result.appletId,
                    workspaceId: result.workspaceId,
                    alreadyMigrated: result.alreadyMigrated,
                    warnings: result.warnings || [],
                });
            } catch (error) {
                logJson({
                    event: "error",
                    appletId: inventory.appletId,
                    workspaceId: inventory.workspaceId,
                    error: error?.message || String(error),
                });
                if (!options.all) process.exitCode = 1;
            }
        }
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
});
