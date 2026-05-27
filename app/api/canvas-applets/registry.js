import Applet from "../models/applet";
import App, { APP_TYPES, APP_STATUS } from "../models/app";
import { uploadBufferToMediaService } from "../utils/media-service-utils";
import { createAppletGlobalStorageTarget } from "../../../src/utils/storageTargets";
import {
    applyPublishedAppletSnapshot,
    clearPublishedContentFields,
    createAppletVersionEntry,
    deleteAppletVersionSnapshots,
    deletePublishedAppletSnapshot,
    deleteReplacedPublishedAppletSnapshot,
    getPublishedAppletSnapshot,
    hydrateAppletVersionContents,
    resolveAppletVersionContent,
} from "./versioning";
import {
    buildAppletFilenameFromWorkspacePath,
    ensureAppletWorkspaceFile,
    getAppletWorkspaceUploadSubPath,
    getCanvasAppletEditableFileInfo,
    isCanvasAppletHtmlFile,
    resolveCanvasAppletFileByWorkspacePath,
} from "./files";
import { deleteCanvasAppletArtifacts } from "./delete";

const RESERVED_APP_NAMES = new Set([
    "Translate",
    "Transcribe",
    "Write",
    "Workspaces",
    "Images",
    "Jira",
]);

function toPlainApplet(applet) {
    return typeof applet?.toObject === "function" ? applet.toObject() : applet;
}

async function maybeLean(queryOrValue) {
    if (!queryOrValue) return null;
    if (typeof queryOrValue.lean === "function") {
        return queryOrValue.lean();
    }
    return queryOrValue;
}

function isV2(applet) {
    return Number(applet?.version || 1) === 2;
}

function versionsOf(applet) {
    return Array.isArray(applet?.htmlVersions) ? applet.htmlVersions : [];
}

function publishedIndexOf(applet) {
    return typeof applet?.publishedVersionIndex === "number"
        ? applet.publishedVersionIndex
        : null;
}

function parseVersionNumber(value, field) {
    if (value == null || value === "") return null;
    const version = Number(value);
    if (!Number.isInteger(version) || version <= 0) {
        const error = new Error(`${field} must be a positive whole number`);
        error.status = 400;
        throw error;
    }
    return version;
}

function getVersionByNumber(applet, versionNumber) {
    const versions = versionsOf(applet);
    const index = versionNumber - 1;
    const version = versions[index] || null;
    if (!version) {
        const error = new Error(
            `Version ${versionNumber} not found. Applet has ${versions.length} saved version(s).`,
        );
        error.status = 404;
        throw error;
    }
    return { version, index };
}

function ensureHtmlContent(html, message) {
    if (typeof html === "string" && html.length > 0) return html;
    const error = new Error(message);
    error.status = 404;
    throw error;
}

const EMPTY_APPLET_DRAFT_HTML =
    "<!doctype html><html><head></head><body></body></html>";

function slugify(value) {
    return (value || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

async function resolveExistingAppSlug(applet, appName, requestedSlug) {
    if (requestedSlug) return requestedSlug;
    const existing = await maybeLean(App.findOne({ appletId: applet._id }));
    return existing?.slug || slugify(appName);
}

async function validateAppStorePublish(applet, body) {
    if (body.publishToAppStore !== true) return null;

    const appName =
        body.appName || body.name || applet.name || "Untitled Applet";
    if (RESERVED_APP_NAMES.has(appName)) {
        const error = new Error(
            `App name "${appName}" is reserved. Please use another name.`,
        );
        error.status = 400;
        throw error;
    }

    const appSlug = await resolveExistingAppSlug(applet, appName, body.appSlug);
    const collision = await maybeLean(
        App.findOne({
            slug: appSlug,
            appletId: { $ne: applet._id },
            status: APP_STATUS.ACTIVE,
        }),
    );
    if (collision) {
        const error = new Error(
            `The slug "${appSlug}" is already in use. Please choose a different slug.`,
        );
        error.status = 400;
        throw error;
    }

    return { appName, appSlug };
}

async function saveApplet(applet) {
    if (typeof applet.save === "function") {
        return applet.save();
    }
    return Applet.findByIdAndUpdate(applet._id, applet, {
        new: true,
        runValidators: true,
    });
}

async function loadOwnedApplet(user, id, { materializeLegacy = false } = {}) {
    const applet = await Applet.findOne({ _id: id, owner: user._id });
    if (!applet) {
        const error = new Error("Applet not found");
        error.status = 404;
        throw error;
    }

    if (materializeLegacy && !applet.filePath) {
        const materialized = await ensureAppletWorkspaceFile(
            toPlainApplet(applet),
            user,
        );
        if (
            materialized?.filePath &&
            materialized.filePath !== applet.filePath
        ) {
            const refreshed = await Applet.findById(applet._id);
            return refreshed || applet;
        }
    }

    return applet;
}

async function toRegistryPayload(applet, user, { includeApp = true } = {}) {
    const plain = await hydrateAppletVersionContents(
        toPlainApplet(applet),
        user,
    );
    const [fileInfo, app] = await Promise.all([
        getCanvasAppletEditableFileInfo(plain, user),
        includeApp
            ? maybeLean(
                  App.findOne({
                      appletId: plain._id,
                      status: APP_STATUS.ACTIVE,
                  }),
              )
            : null,
    ]);

    return {
        ...plain,
        ...fileInfo,
        app: app || null,
    };
}

async function resolveLinkedWorkspaceFile(workspacePath, user) {
    const linkedFile = await resolveCanvasAppletFileByWorkspacePath(
        workspacePath,
        user,
    );
    if (!linkedFile) {
        const error = new Error(
            "Workspace file not found for this applet link",
        );
        error.status = 404;
        throw error;
    }
    if (!isCanvasAppletHtmlFile(linkedFile)) {
        const error = new Error(
            "Applet workspace link must point to an HTML file",
        );
        error.status = 400;
        throw error;
    }
    return linkedFile;
}

async function writeDraftToWorkspace(applet, user, html, workspacePath) {
    const filename = buildAppletFilenameFromWorkspacePath(
        workspacePath,
        applet.name || "Applet",
    );
    const buffer = Buffer.from(typeof html === "string" ? html : "", "utf8");
    const uploadResult = await uploadBufferToMediaService(
        buffer,
        {
            filename,
            mimeType: "text/html",
            size: buffer.length,
        },
        {
            storageTarget: createAppletGlobalStorageTarget(user.contextId),
            subPath: getAppletWorkspaceUploadSubPath(workspacePath),
        },
    );

    if (uploadResult?.error || !uploadResult?.data?.url) {
        const error = new Error("Failed to write applet HTML to workspace");
        error.status = 502;
        throw error;
    }

    return uploadResult.data.converted?.url || uploadResult.data.url;
}

async function latestVersionHtml(applet) {
    const versions = versionsOf(applet);
    return resolveAppletVersionContent(versions[versions.length - 1]);
}

async function appendVersionIfChanged(applet, user, html) {
    const versions = versionsOf(applet);
    const currentLatestHtml = await latestVersionHtml(applet);
    if (versions.length > 0 && currentLatestHtml === html) {
        return {
            versionSaved: false,
            latestVersionIndex: versions.length - 1,
        };
    }

    const entry = await createAppletVersionEntry(applet, user, html, {
        versionIndex: versions.length,
        external: isV2(applet),
    });
    applet.htmlVersions = [...versions, entry];
    return {
        versionSaved: true,
        latestVersionIndex: versions.length,
    };
}

async function publishVersionIndex(applet, index) {
    const version = versionsOf(applet)[index];
    const html = ensureHtmlContent(
        await resolveAppletVersionContent(version),
        `Version ${index + 1} has no HTML content`,
    );

    applet.publishedVersionIndex = index;
    if (isV2(applet)) {
        return applyPublishedAppletSnapshot(applet, html, {
            versionIndex: index,
        });
    }
    return null;
}

async function unpublish(applet) {
    const previousPublishedSnapshot = isV2(applet)
        ? getPublishedAppletSnapshot(applet)
        : null;
    if (isV2(applet)) {
        clearPublishedContentFields(applet);
    }
    applet.publishedVersionIndex = null;
    return previousPublishedSnapshot;
}

async function applyAppStoreState(applet, user, body, appStorePublish) {
    if (body.publishToAppStore === undefined) return;

    if (body.publishToAppStore) {
        await App.findOneAndUpdate(
            { appletId: applet._id },
            {
                name: appStorePublish.appName,
                slug: appStorePublish.appSlug,
                author: user._id,
                type: APP_TYPES.APPLET,
                status: APP_STATUS.ACTIVE,
                appletId: applet._id,
                icon: body.appIcon || null,
                description: body.appDescription || null,
            },
            { new: true, upsert: true, runValidators: true },
        );
    } else {
        await App.findOneAndUpdate(
            { appletId: applet._id },
            { status: APP_STATUS.INACTIVE },
            { new: true },
        );
    }
}

export async function listAppletRegistry(user) {
    const applets = await Applet.find({ owner: user._id })
        .select(
            "name filePath publishedVersionIndex version createdAt updatedAt sdkSuspendedAt sdkSuspendedUntil sdkSuspendedReason",
        )
        .sort({ updatedAt: -1 })
        .lean();

    const hydrated = await Promise.all(
        applets.map(async (applet) => ({
            ...applet,
            ...(await getCanvasAppletEditableFileInfo(applet, user)),
        })),
    );

    return { applets: hydrated };
}

export async function createAppletRegistry(user, body = {}) {
    const { name, filePath, html, workspacePath } = body;
    let resolvedFilePath = filePath || null;

    if (workspacePath) {
        const linkedFile = await resolveLinkedWorkspaceFile(
            workspacePath,
            user,
        );
        const possiblePaths = [linkedFile.url, linkedFile.gcsUrl].filter(
            Boolean,
        );
        const duplicate = await maybeLean(
            Applet.findOne({
                owner: user._id,
                filePath: { $in: possiblePaths },
            }),
        );
        if (duplicate) {
            const error = new Error(
                "An applet already references this workspace file",
            );
            error.status = 409;
            error.details = { appletId: duplicate._id };
            throw error;
        }
        resolvedFilePath =
            linkedFile.url || linkedFile.gcsUrl || resolvedFilePath;
    } else if (filePath) {
        const duplicate = await maybeLean(
            Applet.findOne({
                owner: user._id,
                filePath,
            }),
        );
        if (duplicate) {
            const error = new Error("An applet already references this file");
            error.status = 409;
            error.details = { appletId: duplicate._id };
            throw error;
        }
    }

    const applet = await Applet.create({
        owner: user._id,
        name: name || "Untitled Applet",
        filePath: resolvedFilePath,
        html: "",
        version: 2,
        htmlVersions: [],
    });

    if (html) {
        const { latestVersionIndex } = await appendVersionIfChanged(
            applet,
            user,
            html,
        );
        applet.html = "";
        await saveApplet(applet);
        return {
            ...(await toRegistryPayload(applet, user, { includeApp: false })),
            versionSaved: true,
            latestVersionIndex,
        };
    }

    return toRegistryPayload(applet, user, { includeApp: false });
}

export async function getAppletRegistry(user, id) {
    const applet = await loadOwnedApplet(user, id, { materializeLegacy: true });
    return toRegistryPayload(applet, user);
}

export async function updateAppletRegistry(user, id, body = {}) {
    const restoreVersion = parseVersionNumber(
        body.restoreVersion,
        "restoreVersion",
    );
    const publishVersion = parseVersionNumber(
        body.publishVersion,
        "publishVersion",
    );
    const deleteVersion = parseVersionNumber(
        body.deleteVersion,
        "deleteVersion",
    );
    const clearDraft = body.clearDraft === true;
    const applet = await loadOwnedApplet(user, id, { materializeLegacy: true });
    const appStorePublish = await validateAppStorePublish(applet, body);
    let versionSaved = false;
    let versionDeleted = false;
    let deletedVersion = null;
    let latestVersionIndex =
        versionsOf(applet).length > 0 ? versionsOf(applet).length - 1 : null;
    const postSaveCleanups = [];

    function queuePublishedReplacementCleanup(replacement) {
        if (!replacement) return;
        postSaveCleanups.push(() =>
            deleteReplacedPublishedAppletSnapshot(
                replacement.previousPublishedSnapshot,
                replacement.nextPublishedSnapshot,
            ),
        );
    }

    function queuePublishedDeleteCleanup(snapshot) {
        if (!snapshot) return;
        postSaveCleanups.push(() => deletePublishedAppletSnapshot(snapshot));
    }

    function queueVersionDeleteCleanup(versions) {
        if (!versions?.length) return;
        postSaveCleanups.push(() =>
            deleteAppletVersionSnapshots(versions, user),
        );
    }

    if (body.name !== undefined) {
        applet.name = body.name;
    }

    if (body.filePath !== undefined) {
        applet.filePath = body.filePath || null;
    }

    if (body.workspacePath !== undefined) {
        const linkedFile = await resolveLinkedWorkspaceFile(
            body.workspacePath,
            user,
        );
        applet.filePath =
            linkedFile.url || linkedFile.gcsUrl || applet.filePath;
    }

    if (body.clearSdkSuspension === true) {
        applet.sdkSuspendedAt = undefined;
        applet.sdkSuspendedUntil = undefined;
        applet.sdkSuspendedReason = undefined;
    }

    let htmlForDraft = body.html;
    if (restoreVersion != null) {
        const { version, index } = getVersionByNumber(applet, restoreVersion);
        htmlForDraft = ensureHtmlContent(
            await resolveAppletVersionContent(version),
            `Version ${restoreVersion} has no HTML content`,
        );
        const { workspacePath } = await getCanvasAppletEditableFileInfo(
            toPlainApplet(applet),
            user,
        );
        const targetWorkspacePath = body.workspacePath || workspacePath || null;
        if (!targetWorkspacePath) {
            const error = new Error(
                "No editable workspace file is linked to this applet",
            );
            error.status = 400;
            throw error;
        }
        applet.filePath = await writeDraftToWorkspace(
            applet,
            user,
            htmlForDraft,
            targetWorkspacePath,
        );
        latestVersionIndex = index;
    }

    if (clearDraft) {
        const versions = versionsOf(applet);
        const latestVersion = versions[versions.length - 1] || null;
        const draftHtml = latestVersion
            ? ensureHtmlContent(
                  await resolveAppletVersionContent(latestVersion),
                  "Latest version has no HTML content",
              )
            : EMPTY_APPLET_DRAFT_HTML;
        const { workspacePath } = await getCanvasAppletEditableFileInfo(
            toPlainApplet(applet),
            user,
        );
        const targetWorkspacePath = body.workspacePath || workspacePath || null;
        if (!targetWorkspacePath) {
            const error = new Error(
                "No editable workspace file is linked to this applet",
            );
            error.status = 400;
            throw error;
        }
        applet.filePath = await writeDraftToWorkspace(
            applet,
            user,
            draftHtml,
            targetWorkspacePath,
        );
        if (!isV2(applet)) {
            applet.html = draftHtml;
        }
        latestVersionIndex = latestVersion ? versions.length - 1 : null;
    }

    if (publishVersion != null) {
        const { index } = getVersionByNumber(applet, publishVersion);
        queuePublishedReplacementCleanup(
            await publishVersionIndex(applet, index),
        );
    }

    if (deleteVersion != null) {
        const versions = versionsOf(applet);
        const { version, index } = getVersionByNumber(applet, deleteVersion);
        const publishedIndex = publishedIndexOf(applet);

        applet.htmlVersions = versions.filter((_, i) => i !== index);
        if (publishedIndex === index) {
            queuePublishedDeleteCleanup(await unpublish(applet));
        } else if (publishedIndex != null && publishedIndex > index) {
            applet.publishedVersionIndex = publishedIndex - 1;
            if (isV2(applet) && applet.publishedContentVersionIndex != null) {
                applet.publishedContentVersionIndex = publishedIndex - 1;
            }
        }

        queueVersionDeleteCleanup([version]);
        versionDeleted = true;
        deletedVersion = deleteVersion;
        latestVersionIndex =
            applet.htmlVersions.length > 0
                ? applet.htmlVersions.length - 1
                : null;
    }

    if (htmlForDraft !== undefined) {
        if (body.saveVersion === true || body.publish === true) {
            const versionResult = await appendVersionIfChanged(
                applet,
                user,
                htmlForDraft,
            );
            versionSaved = versionResult.versionSaved;
            latestVersionIndex = versionResult.latestVersionIndex;
            if (body.publish === true) {
                queuePublishedReplacementCleanup(
                    await publishVersionIndex(applet, latestVersionIndex),
                );
            }
        }

        applet.html = isV2(applet) ? "" : htmlForDraft;
    } else if (
        (body.saveVersion === true || body.publish === true) &&
        restoreVersion == null &&
        publishVersion == null &&
        deleteVersion == null &&
        !clearDraft
    ) {
        const error = new Error("html is required when saving or publishing");
        error.status = 400;
        throw error;
    }

    if (body.unpublish) {
        queuePublishedDeleteCleanup(await unpublish(applet));
    }

    if (
        body.publishToAppStore === true &&
        isV2(applet) &&
        publishedIndexOf(applet) != null &&
        (!applet.publishedContentBlobPath ||
            applet.publishedContentVersionIndex !== publishedIndexOf(applet))
    ) {
        queuePublishedReplacementCleanup(
            await publishVersionIndex(applet, publishedIndexOf(applet)),
        );
    }

    const savedApplet = await saveApplet(applet);
    if (body.clearSdkSuspension === true) {
        await Applet.updateOne(
            { _id: applet._id },
            {
                $unset: {
                    sdkSuspendedAt: "",
                    sdkSuspendedUntil: "",
                    sdkSuspendedReason: "",
                },
            },
        );
        for (const target of [applet, savedApplet]) {
            if (!target) continue;
            delete target.sdkSuspendedAt;
            delete target.sdkSuspendedUntil;
            delete target.sdkSuspendedReason;
        }
    }
    await Promise.allSettled(
        postSaveCleanups.map(async (cleanup) => {
            try {
                return await cleanup();
            } catch (error) {
                console.warn(
                    "updateAppletRegistry: failed to clean applet storage artifact:",
                    error?.message,
                );
                return null;
            }
        }),
    );
    await applyAppStoreState(
        savedApplet || applet,
        user,
        body,
        appStorePublish,
    );

    return {
        ...(await toRegistryPayload(savedApplet || applet, user)),
        versionSaved,
        versionDeleted,
        deletedVersion,
        latestVersionIndex,
    };
}

export async function deleteAppletRegistry(user, id) {
    const applet = await loadOwnedApplet(user, id);
    await deleteCanvasAppletArtifacts(applet, user);
    await Applet.deleteOne({ _id: id, owner: user._id });
    await App.findOneAndUpdate(
        { appletId: id },
        { status: APP_STATUS.INACTIVE },
    );
    return { success: true };
}
