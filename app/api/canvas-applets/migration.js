import Applet from "../models/applet";
import App, { APP_STATUS, APP_TYPES } from "../models/app";
import File from "../models/file";
import Workspace from "../models/workspace";
import {
    hashBuffer,
    uploadBufferToMediaService,
} from "../utils/media-service-utils";
import { createAppletGlobalStorageTarget } from "../../../src/utils/storageTargets";
import {
    injectAppletIdMeta,
    injectAppletMetaTags,
} from "../../../src/utils/appletHtmlUtils";
import { ensureAppletSdkScript } from "../../../src/utils/appletSdkUtils";
import {
    applyPublishedAppletSnapshot,
    createAppletVersionEntry,
    resolveAppletVersionContent,
} from "./versioning";
import { getCanvasAppletEditableFileInfo } from "./files";
import { canonicalizeAppletApps } from "./app-records";

const EMPTY_APPLET_HTML =
    "<!doctype html><html><head></head><body></body></html>";
const MIGRATION_PENDING_STALE_MS = 10 * 60 * 1000;

function toPlain(doc) {
    return typeof doc?.toObject === "function" ? doc.toObject() : doc;
}

async function maybeLean(queryOrValue) {
    if (!queryOrValue) return null;
    if (typeof queryOrValue.lean === "function") return queryOrValue.lean();
    return queryOrValue;
}

function idString(value) {
    return (
        value?._id?.toString?.() || value?.toString?.() || String(value || "")
    );
}

function slugify(value) {
    return (value || "applet")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

function normalizeAppletHtml(html, applet) {
    const withTypeAndName = injectAppletMetaTags(
        html || EMPTY_APPLET_HTML,
        applet?.name || "Applet",
    );
    const withId = injectAppletIdMeta(withTypeAndName, idString(applet));
    return ensureAppletSdkScript(withId);
}

function cleanName(value) {
    const name = typeof value === "string" ? value.trim() : "";
    return name || null;
}

function resolveMigrationAppletName({ applet, workspace, app }) {
    return (
        cleanName(app?.name) ||
        cleanName(applet?.name) ||
        cleanName(workspace?.name) ||
        "Applet"
    );
}

function isV2Applet(applet) {
    return Number(applet?.version || 1) === 2 && Boolean(applet?.filePath);
}

async function buildMigrationResponse({
    applet,
    workspace,
    app,
    user,
    alreadyMigrated,
    warnings,
}) {
    const plainApplet = toPlain(applet);
    const payload = {
        applet: plainApplet,
        appletId: idString(plainApplet),
        version: 2,
        alreadyMigrated,
        workspaceId: workspace?._id ? idString(workspace._id) : null,
        app: app || null,
        warnings: warnings || plainApplet.migrationWarnings || [],
    };
    return {
        ...payload,
        ...(await getCanvasAppletEditableFileInfo(plainApplet, user)),
    };
}

async function resolveSourceHtml(applet, warnings) {
    if (typeof applet?.html === "string" && applet.html.trim()) {
        return applet.html;
    }

    const versions = Array.isArray(applet?.htmlVersions)
        ? applet.htmlVersions
        : [];
    const publishedIndex =
        typeof applet?.publishedVersionIndex === "number"
            ? applet.publishedVersionIndex
            : null;

    if (publishedIndex != null && versions[publishedIndex]) {
        const html = await resolveAppletVersionContent(
            versions[publishedIndex],
        );
        if (html) return html;
        warnings.push("Published version had no resolvable HTML.");
    } else if (publishedIndex != null) {
        warnings.push("Published version index was out of range.");
    }

    const latest = versions[versions.length - 1];
    if (latest) {
        const html = await resolveAppletVersionContent(latest);
        if (html) return html;
    }

    warnings.push("No recoverable applet HTML found; created an empty Draft.");
    return EMPTY_APPLET_HTML;
}

async function findWorkspaceByIdOrSlug(workspaceId) {
    try {
        const workspace =
            await Workspace.findById(workspaceId).populate("applet");
        if (workspace) return workspace;
    } catch (error) {
        if (error?.name !== "CastError") {
            throw error;
        }
    }

    return Workspace.findOne({ slug: workspaceId }).populate("applet");
}

async function resolveMigrationSource({ workspaceId, appletId, appSlug }) {
    let app = null;
    let workspace = null;
    let applet = null;

    if (appSlug) {
        app = await maybeLean(
            App.findOne({
                slug: appSlug,
                type: APP_TYPES.APPLET,
                status: APP_STATUS.ACTIVE,
            }),
        );
        if (!app) {
            const error = new Error("App not found");
            error.status = 404;
            throw error;
        }
        if (app.appletId) {
            appletId = idString(app.appletId);
        } else if (app.workspaceId) {
            workspaceId = idString(app.workspaceId);
        }
    }

    if (workspaceId) {
        workspace = await findWorkspaceByIdOrSlug(workspaceId);
        if (!workspace) {
            const error = new Error("Workspace not found");
            error.status = 404;
            throw error;
        }
        applet = workspace.applet || null;
    }

    if (!applet && appletId) {
        applet = await Applet.findById(appletId);
        if (!applet) {
            const error = new Error("Applet not found");
            error.status = 404;
            throw error;
        }
        workspace = await Workspace.findOne({ applet: applet._id });
    }

    if (!applet) {
        const error = new Error("Applet not found");
        error.status = 404;
        throw error;
    }

    if (!workspace) {
        workspace = await Workspace.findOne({ applet: applet._id });
    }

    if (!app) {
        app = await maybeLean(
            App.findOne({
                type: APP_TYPES.APPLET,
                status: APP_STATUS.ACTIVE,
                $or: [
                    { appletId: applet._id },
                    ...(workspace?._id ? [{ workspaceId: workspace._id }] : []),
                ],
            }),
        );
    }

    return { workspace, applet, app };
}

async function writeDraftFile(applet, user, html) {
    if (!user?.contextId) {
        const error = new Error("Cannot migrate applet without user context");
        error.status = 400;
        throw error;
    }

    const appletId = idString(applet);
    const filename = `${slugify(applet.name || "applet")}-${appletId}.html`;
    const buffer = Buffer.from(html, "utf8");
    const hash = await hashBuffer(buffer);
    const uploadResult = await uploadBufferToMediaService(
        buffer,
        {
            filename,
            mimeType: "text/html",
            size: buffer.length,
            hash,
        },
        {
            storageTarget: createAppletGlobalStorageTarget(user.contextId),
        },
    );

    if (uploadResult?.error || !uploadResult?.data?.url) {
        const error = new Error("Failed to write migrated applet Draft");
        error.status = 502;
        throw error;
    }

    const data = uploadResult.data;
    const filePath = data.converted?.url || data.url;
    const gcsUrl = data.converted?.gcs || data.gcs || null;

    try {
        await new File({
            filename: data.filename || filename,
            originalName: filename,
            mimeType: "text/html",
            size: buffer.length,
            url: filePath,
            gcsUrl,
            hash: data.hash || hash,
            blobPath: data.blobPath || data.converted?.blobPath || null,
            owner: user._id,
        }).save();
    } catch (error) {
        console.warn(
            "migrateWorkspaceAppletToV2: File document insert skipped:",
            error?.message,
        );
    }

    return filePath;
}

async function migrateVersions(applet, user, sourceHtml) {
    const legacyVersions = Array.isArray(applet?.htmlVersions)
        ? applet.htmlVersions
        : [];
    const sourceVersions =
        legacyVersions.length > 0 ? legacyVersions : [{ content: sourceHtml }];

    const migrated = [];
    for (let index = 0; index < sourceVersions.length; index += 1) {
        const version = sourceVersions[index];
        const html =
            (await resolveAppletVersionContent(version)) ||
            (index === sourceVersions.length - 1 ? sourceHtml : "");
        if (!html) continue;

        const entry = await createAppletVersionEntry(
            { ...toPlain(applet), version: 2 },
            user,
            normalizeAppletHtml(html, applet),
            { versionIndex: migrated.length, external: true },
        );
        entry.timestamp = version?.timestamp || entry.timestamp || new Date();
        migrated.push(entry);
    }

    return migrated;
}

async function backfillAppStoreRow({ workspace, applet, app }) {
    if (!workspace?._id && !app?._id) return null;

    const query = app?._id
        ? { _id: app._id }
        : {
              workspaceId: workspace._id,
              type: APP_TYPES.APPLET,
              status: APP_STATUS.ACTIVE,
          };

    const updatedApp = await App.findOneAndUpdate(
        query,
        {
            $set: {
                appletId: applet._id,
                ...(workspace?._id ? { workspaceId: workspace._id } : {}),
            },
        },
        { new: true },
    ).lean();

    return canonicalizeAppletApps(applet._id, {
        preferredAppId: updatedApp?._id || app?._id || null,
    });
}

export async function migrateWorkspaceAppletToV2({
    workspaceId = null,
    appletId = null,
    appSlug = null,
    user,
    dryRun = false,
} = {}) {
    if (!user?._id) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }

    const { workspace, applet, app } = await resolveMigrationSource({
        workspaceId,
        appletId,
        appSlug,
    });

    if (String(applet.owner) !== String(user._id)) {
        const error = new Error("Access denied");
        error.status = 403;
        throw error;
    }

    const plainApplet = toPlain(applet);
    const migrationAppletName = resolveMigrationAppletName({
        applet: plainApplet,
        workspace,
        app,
    });
    if (isV2Applet(plainApplet)) {
        let responseApplet = plainApplet;
        if (
            cleanName(app?.name) &&
            cleanName(plainApplet.name) !== migrationAppletName
        ) {
            responseApplet = (await Applet.findByIdAndUpdate(
                plainApplet._id,
                { $set: { name: migrationAppletName } },
                { new: true },
            ).lean()) || {
                ...plainApplet,
                name: migrationAppletName,
            };
        }
        return buildMigrationResponse({
            applet: responseApplet,
            workspace,
            app,
            user,
            alreadyMigrated: true,
        });
    }

    const warnings = [];

    if (dryRun) {
        await resolveSourceHtml(plainApplet, warnings);
        return {
            appletId: idString(plainApplet),
            version: 2,
            alreadyMigrated: false,
            dryRun: true,
            workspaceId: workspace?._id ? idString(workspace._id) : null,
            warnings,
        };
    }

    const stalePendingBefore = new Date(
        Date.now() - MIGRATION_PENDING_STALE_MS,
    );
    const lockResult = await Applet.updateOne(
        {
            _id: plainApplet._id,
            $or: [
                { migrationStatus: { $exists: false } },
                { migrationStatus: { $ne: "pending" } },
                { updatedAt: { $lt: stalePendingBefore } },
            ],
        },
        {
            $set: { migrationStatus: "pending" },
            $unset: { migrationError: "" },
        },
    );
    if (lockResult?.matchedCount === 0) {
        const currentApplet = await maybeLean(Applet.findById(plainApplet._id));
        if (isV2Applet(currentApplet)) {
            return buildMigrationResponse({
                applet: currentApplet,
                workspace,
                app,
                user,
                alreadyMigrated: true,
            });
        }

        const error = new Error("Applet migration is already in progress");
        error.status = 409;
        throw error;
    }

    try {
        const sourceApplet = {
            ...plainApplet,
            name: migrationAppletName,
        };
        const sourceHtml = await resolveSourceHtml(plainApplet, warnings);
        const normalizedSourceHtml = normalizeAppletHtml(
            sourceHtml,
            sourceApplet,
        );
        const filePath = await writeDraftFile(
            sourceApplet,
            user,
            normalizedSourceHtml,
        );
        const migratedVersions = await migrateVersions(
            sourceApplet,
            user,
            normalizedSourceHtml,
        );
        let publishedVersionIndex =
            typeof plainApplet.publishedVersionIndex === "number"
                ? plainApplet.publishedVersionIndex
                : null;

        const migratedApplet = {
            ...plainApplet,
            name: migrationAppletName,
            filePath,
            html: "",
            version: 2,
            htmlVersions: migratedVersions,
            migratedFromWorkspaceId: workspace?._id || undefined,
            migratedFromAppletVersion: Number(plainApplet.version || 1),
            migratedAt: new Date(),
            migrationStatus: "migrated",
            migrationWarnings: warnings,
            migrationError: undefined,
        };

        if (
            publishedVersionIndex != null &&
            (publishedVersionIndex < 0 ||
                publishedVersionIndex >= migratedVersions.length)
        ) {
            warnings.push(
                "Published version index was invalid; published latest migrated version.",
            );
            publishedVersionIndex =
                migratedVersions.length > 0
                    ? migratedVersions.length - 1
                    : null;
        }

        if (publishedVersionIndex != null) {
            const publishedHtml = await resolveAppletVersionContent(
                migratedVersions[publishedVersionIndex],
            );
            migratedApplet.publishedVersionIndex = publishedVersionIndex;
            await applyPublishedAppletSnapshot(migratedApplet, publishedHtml, {
                versionIndex: publishedVersionIndex,
            });
        }

        const savedApplet = await Applet.findByIdAndUpdate(
            plainApplet._id,
            {
                $set: {
                    name: migratedApplet.name,
                    filePath: migratedApplet.filePath,
                    html: "",
                    version: 2,
                    htmlVersions: migratedApplet.htmlVersions,
                    publishedVersionIndex:
                        migratedApplet.publishedVersionIndex ?? null,
                    publishedContentUrl: migratedApplet.publishedContentUrl,
                    publishedContentBlobPath:
                        migratedApplet.publishedContentBlobPath,
                    publishedContentHash: migratedApplet.publishedContentHash,
                    publishedContentSize: migratedApplet.publishedContentSize,
                    publishedContentContextId:
                        migratedApplet.publishedContentContextId,
                    publishedContentVersionIndex:
                        migratedApplet.publishedContentVersionIndex,
                    publishedContentTimestamp:
                        migratedApplet.publishedContentTimestamp,
                    migratedFromWorkspaceId:
                        migratedApplet.migratedFromWorkspaceId,
                    migratedFromAppletVersion:
                        migratedApplet.migratedFromAppletVersion,
                    migratedAt: migratedApplet.migratedAt,
                    migrationStatus: "migrated",
                    migrationWarnings: warnings,
                },
                $unset: { migrationError: "" },
            },
            { new: true },
        ).lean();

        const updatedApp = await backfillAppStoreRow({
            workspace,
            applet: savedApplet || migratedApplet,
            app,
        });
        const responseApplet = savedApplet || migratedApplet;

        return {
            applet: responseApplet,
            appletId: idString(responseApplet),
            version: 2,
            alreadyMigrated: false,
            workspaceId: workspace?._id ? idString(workspace._id) : null,
            app: updatedApp || app || null,
            warnings,
            ...(await getCanvasAppletEditableFileInfo(responseApplet, user)),
        };
    } catch (error) {
        await Applet.updateOne(
            { _id: plainApplet._id },
            {
                $set: {
                    migrationStatus: "failed",
                    migrationError: error?.message || "Migration failed",
                },
            },
        );
        throw error;
    }
}
