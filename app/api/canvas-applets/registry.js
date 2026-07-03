import Applet from "../models/applet";
import Share from "../models/share.js";
import App, { APP_TYPES, APP_STATUS } from "../models/app";
import User from "../models/user.mjs";
import { resolveShareAccess } from "../utils/shareAccess";
import {
    sanitizeShareRecipients,
    upsertEntityShare,
} from "../utils/shareHelpers";
import { publishedAppletUrl } from "@/components/share/shareUtils.js";
import { uploadBufferToMediaService } from "../utils/media-service-utils";
import { ensureAppletRuntimeHtml } from "../../../src/utils/appletSdkUtils";
import {
    buildCanonicalAppByAppletId,
    findCanonicalAppletApp,
    hydrateMissingAppletImageVariants,
    hydrateMissingAppletImageVariantsForApp,
    upsertCanonicalAppletApp,
} from "./app-records";
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
    resolvePublishedAppletContent,
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
import { stripHTML } from "../../../src/utils/html.utils";

const RESERVED_APP_NAMES = new Set([
    "Translate",
    "Transcribe",
    "Write",
    "Workspaces",
    "Images",
    "Jira",
]);

const appletMutationLocks = new Map();

function toPlainApplet(applet) {
    return typeof applet?.toObject === "function" ? applet.toObject() : applet;
}

async function withAppletMutationLock(key, operation) {
    const previous = appletMutationLocks.get(key) || Promise.resolve();
    const run = previous.catch(() => null).then(operation);
    const cleanup = run
        .finally(() => {
            if (appletMutationLocks.get(key) === cleanup) {
                appletMutationLocks.delete(key);
            }
        })
        .catch(() => null);
    appletMutationLocks.set(key, cleanup);
    return run;
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

function shareHasActiveAccess(share) {
    if (!share) return false;
    if (share.link?.enabled) return true;
    return Array.isArray(share.recipients) && share.recipients.length > 0;
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
const APP_METADATA_TEXT_LIMITS = {
    name: 80,
    description: 500,
    badgeLabel: 40,
    imageAlt: 160,
    category: 40,
};
const MAX_APP_METADATA_TAGS = 8;
const APP_METADATA_STOP_WORDS = new Set([
    "about",
    "after",
    "also",
    "and",
    "app",
    "applet",
    "are",
    "because",
    "been",
    "being",
    "can",
    "for",
    "from",
    "has",
    "have",
    "into",
    "its",
    "more",
    "not",
    "our",
    "that",
    "the",
    "their",
    "this",
    "with",
    "you",
    "your",
]);

function slugify(value) {
    return (value || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function trimText(value, limit) {
    if (value == null) return null;
    const text = String(value).replace(/\s+/g, " ").trim();
    return text ? text.slice(0, limit) : null;
}

function normalizeIconName(value) {
    const icon = trimText(value, 80);
    return /^[A-Za-z][A-Za-z0-9]*$/.test(icon || "") ? icon : "AppWindow";
}

function normalizeImageUrl(value) {
    const imageUrl = trimText(value, 1000);
    if (!imageUrl) return null;
    if (
        imageUrl.startsWith("/") ||
        imageUrl.startsWith("data:image/") ||
        /^https?:\/\//i.test(imageUrl)
    ) {
        return imageUrl;
    }
    const error = new Error("App image must be a valid image URL");
    error.status = 400;
    throw error;
}

function normalizeTags(value) {
    const rawTags = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(",")
          : [];
    const tags = [];
    const seen = new Set();

    for (const rawTag of rawTags) {
        const tag = trimText(rawTag, 40)?.toLowerCase();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        tags.push(tag);
        if (tags.length >= MAX_APP_METADATA_TAGS) break;
    }
    return tags;
}

function readAppMetadataInput(body = {}) {
    const nested =
        body.appMetadata &&
        typeof body.appMetadata === "object" &&
        !Array.isArray(body.appMetadata)
            ? body.appMetadata
            : {};
    const read = (nestedKey, bodyKey) =>
        nested[nestedKey] !== undefined ? nested[nestedKey] : body[bodyKey];

    return {
        hasMetadata:
            body.updateAppMetadata === true ||
            Object.keys(nested).length > 0 ||
            [
                "appName",
                "appSlug",
                "appDescription",
                "appIcon",
                "appBadgeLabel",
                "appImageUrl",
                "appImageLightUrl",
                "appImageDarkUrl",
                "appImageAlt",
                "appTags",
                "appCategory",
                "appMetadataGeneratedAt",
            ].some((field) => body[field] !== undefined),
        name: read("name", "appName"),
        slug: read("slug", "appSlug"),
        description: read("description", "appDescription"),
        icon: read("icon", "appIcon"),
        badgeLabel: read("badgeLabel", "appBadgeLabel"),
        imageUrl: read("imageUrl", "appImageUrl"),
        imageLightUrl: read("imageLightUrl", "appImageLightUrl"),
        imageDarkUrl: read("imageDarkUrl", "appImageDarkUrl"),
        imageAlt: read("imageAlt", "appImageAlt"),
        tags: read("tags", "appTags"),
        category: read("category", "appCategory"),
        metadataGeneratedAt: read(
            "metadataGeneratedAt",
            "appMetadataGeneratedAt",
        ),
    };
}

async function resolveAppMetadata(applet, body) {
    const input = readAppMetadataInput(body);
    if (!input.hasMetadata && body.publishToAppStore !== true) return null;
    const existing = await findCanonicalAppletApp(applet._id);
    const appName =
        trimText(
            input.name ?? existing?.name ?? body.name ?? applet.name,
            APP_METADATA_TEXT_LIMITS.name,
        ) || "Untitled Applet";
    if (body.publishToAppStore === true && RESERVED_APP_NAMES.has(appName)) {
        const error = new Error(
            `App name "${appName}" is reserved. Please use another name.`,
        );
        error.status = 400;
        throw error;
    }

    const appSlug = slugify(input.slug || existing?.slug || appName);
    if (!appSlug) {
        const error = new Error("App slug is required");
        error.status = 400;
        throw error;
    }
    const collision = await maybeLean(
        App.findOne({
            slug: appSlug,
            appletId: { $ne: applet._id },
        }),
    );
    if (collision) {
        const error = new Error(
            `The slug "${appSlug}" is already in use. Please choose a different slug.`,
        );
        error.status = 400;
        throw error;
    }

    return {
        name: appName,
        slug: appSlug,
        description:
            trimText(
                input.description ?? existing?.description,
                APP_METADATA_TEXT_LIMITS.description,
            ) || null,
        icon: normalizeIconName(input.icon ?? existing?.icon),
        badgeLabel:
            trimText(
                input.badgeLabel ?? existing?.badgeLabel,
                APP_METADATA_TEXT_LIMITS.badgeLabel,
            ) || null,
        imageUrl: normalizeImageUrl(input.imageUrl ?? existing?.imageUrl),
        imageLightUrl: normalizeImageUrl(
            input.imageLightUrl ?? existing?.imageLightUrl,
        ),
        imageDarkUrl: normalizeImageUrl(
            input.imageDarkUrl ?? existing?.imageDarkUrl,
        ),
        imageAlt:
            trimText(
                input.imageAlt ?? existing?.imageAlt,
                APP_METADATA_TEXT_LIMITS.imageAlt,
            ) || null,
        tags: normalizeTags(input.tags ?? existing?.tags),
        category:
            trimText(
                input.category ?? existing?.category,
                APP_METADATA_TEXT_LIMITS.category,
            ) || null,
        metadataGeneratedAt: input.hasMetadata
            ? input.metadataGeneratedAt
                ? new Date(input.metadataGeneratedAt)
                : existing?.metadataGeneratedAt
            : existing?.metadataGeneratedAt,
    };
}

async function validateAppStorePublish(applet, body) {
    if (body.publishToAppStore !== true) return null;
    return resolveAppMetadata(applet, body);
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

async function loadAppletWithAccess(
    user,
    id,
    { materializeLegacy = false, requireEditor = false } = {},
) {
    const applet = await Applet.findById(id);
    if (!applet) {
        const error = new Error("Applet not found");
        error.status = 404;
        throw error;
    }

    const access = await resolveShareAccess({
        entityType: "applet",
        entityId: applet._id,
        userId: user?._id,
        ownerId: applet.owner,
    });
    if (!access.canAccess) {
        const error = new Error("Applet not found");
        error.status = 404;
        throw error;
    }
    if (requireEditor && !access.isOwner && access.role !== "editor") {
        const error = new Error("Forbidden");
        error.status = 403;
        throw error;
    }
    if (materializeLegacy && !access.isOwner) {
        // Storage materialization writes to the owner's workspace; only the
        // owner triggers it. Shared editors operate on existing artifacts.
        materializeLegacy = false;
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
    const [fileInfo, canonicalApp, access] = await Promise.all([
        getCanvasAppletEditableFileInfo(plain, user),
        includeApp ? findCanonicalAppletApp(plain._id) : null,
        resolveShareAccess({
            entityType: "applet",
            entityId: plain._id,
            userId: user._id,
            ownerId: plain.owner,
        }),
    ]);
    const app = includeApp
        ? await hydrateMissingAppletImageVariantsForApp(canonicalApp, plain._id)
        : null;

    return {
        ...plain,
        ...fileInfo,
        app: app || null,
        isOwner: access.isOwner,
        isShared: access.canAccess && !access.isOwner,
        shareRole: access.role,
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

async function fetchAppletDraftHtml(applet) {
    if (!applet?.filePath) return null;

    try {
        const response = await fetch(applet.filePath, { cache: "no-store" });
        if (!response.ok) return null;
        const html = await response.text();
        return html?.trim() ? html : null;
    } catch (error) {
        console.warn(
            "resolveAppletRuntimeHtml: failed to read applet draft:",
            error?.message,
        );
        return null;
    }
}

async function resolveAppletSourceHtml(applet) {
    const draftHtml = await fetchAppletDraftHtml(applet);
    if (draftHtml) return draftHtml;

    if (typeof applet?.html === "string" && applet.html.length > 0) {
        return applet.html;
    }

    const versions = versionsOf(applet);
    const latestHtml = await resolveAppletVersionContent(
        versions[versions.length - 1],
    );
    return latestHtml?.trim() ? latestHtml : null;
}

function decodeHtmlText(value) {
    return String(value || "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
}

function extractHtmlMeta(html, key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
        `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
        "i",
    );
    const match = html.match(regex);
    return decodeHtmlText(match?.[1] || match?.[2] || "");
}

function extractHtmlTitle(html) {
    return decodeHtmlText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function extractFirstHeading(html) {
    return decodeHtmlText(
        html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
            html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1],
    ).replace(/<[^>]+>/g, " ");
}

function extractFirstImage(html) {
    return (
        extractHtmlMeta(html, "og:image") ||
        html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1] ||
        ""
    );
}

function htmlToPlainText(html) {
    return stripHTML(html);
}

function sentenceFromText(text) {
    const normalized = trimText(text, 420) || "";
    const firstSentence = normalized.match(/^(.{80,260}?[.!?])\s/)?.[1];
    return trimText(firstSentence || normalized, 220);
}

function tagsFromText(text) {
    const words = String(text || "")
        .toLowerCase()
        .match(/[a-z][a-z0-9-]{2,}/g);
    if (!words) return [];

    const counts = new Map();
    for (const word of words) {
        if (APP_METADATA_STOP_WORDS.has(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([word]) => word)
        .slice(0, MAX_APP_METADATA_TAGS);
}

function pickIconForText(text) {
    const normalized = String(text || "").toLowerCase();
    const matches = [
        [/calendar|schedule|date|event/, "CalendarDays"],
        [/chart|analytics|graph|metric|report/, "ChartColumn"],
        [/timer|clock|time|deadline/, "Clock3"],
        [/map|location|travel|place/, "Map"],
        [/image|photo|media|gallery/, "Image"],
        [/audio|voice|transcript|sound/, "AudioLines"],
        [/write|draft|article|copy|editor/, "PenLine"],
        [/search|lookup|research/, "Search"],
        [/task|todo|checklist/, "ListChecks"],
        [/weather|forecast|temperature/, "CloudSun"],
        [/money|budget|finance|invoice/, "BadgeDollarSign"],
    ];
    return (
        matches.find(([regex]) => regex.test(normalized))?.[1] || "AppWindow"
    );
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
    const plainApplet = toPlainApplet(applet);
    const appletId = plainApplet?._id;
    const input = readAppMetadataInput(body);
    const unpublishing = body.unpublish === true;
    const shouldUpdateMetadata =
        input.hasMetadata || body.publishToAppStore === true;

    if (
        body.publishToAppStore === undefined &&
        !shouldUpdateMetadata &&
        !unpublishing
    ) {
        return;
    }

    if (body.publishToAppStore || shouldUpdateMetadata) {
        const metadata =
            appStorePublish || (await resolveAppMetadata(applet, body));
        const listedInStore = unpublishing
            ? false
            : body.publishToAppStore === true
              ? true
              : body.publishToAppStore === false
                ? false
                : undefined;
        const update = {
            name: metadata.name,
            slug: metadata.slug,
            author: user._id,
            type: APP_TYPES.APPLET,
            status: APP_STATUS.ACTIVE,
            appletId,
            icon: metadata.icon || null,
            description: metadata.description || null,
            badgeLabel: metadata.badgeLabel || null,
            imageUrl: metadata.imageUrl || null,
            imageLightUrl: metadata.imageLightUrl || null,
            imageDarkUrl: metadata.imageDarkUrl || null,
            imageAlt: metadata.imageAlt || null,
            tags: metadata.tags || [],
            category: metadata.category || null,
            metadataGeneratedAt: metadata.metadataGeneratedAt || null,
        };
        if (listedInStore !== undefined) {
            update.listedInStore = listedInStore;
        }
        await upsertCanonicalAppletApp(appletId, update, {
            setOnInsert:
                listedInStore === undefined ? { listedInStore: false } : {},
        });
    } else {
        const existing = await findCanonicalAppletApp(appletId);
        if (existing?._id) {
            await upsertCanonicalAppletApp(
                appletId,
                { listedInStore: false },
                { preferredAppId: existing._id },
            );
        }
    }
}

export async function listAppletRegistry(user) {
    const userId = user._id;
    const selectFields =
        "name filePath publishedVersionIndex version owner createdAt updatedAt sdkSuspendedAt sdkSuspendedUntil sdkSuspendedReason";

    const [ownedApplets, ownedShareDocs, recipientShareDocs] =
        await Promise.all([
            Applet.find({ owner: userId }).select(selectFields).lean(),
            Share.find({
                entityType: "applet",
                ownerId: userId,
            })
                .select("entityId ownerId link recipients")
                .lean(),
            Share.find({
                entityType: "applet",
                "recipients.userId": userId,
            })
                .select("entityId ownerId link recipients")
                .lean(),
        ]);

    const ownedIds = new Set(ownedApplets.map((applet) => String(applet._id)));
    const sharedIds = recipientShareDocs
        .map((share) => share.entityId)
        .filter((entityId) => !ownedIds.has(String(entityId)));

    let sharedApplets = [];
    if (sharedIds.length > 0) {
        sharedApplets = await Applet.find({
            _id: { $in: sharedIds },
            version: 2,
        })
            .select(selectFields)
            .lean();
    }

    const shareByEntityId = new Map();
    [...ownedShareDocs, ...recipientShareDocs].forEach((share) => {
        shareByEntityId.set(String(share.entityId), share);
    });

    const merged = [...ownedApplets, ...sharedApplets];
    merged.sort((a, b) => {
        const aMs = Date.parse(a.updatedAt || a.createdAt || 0);
        const bMs = Date.parse(b.updatedAt || b.createdAt || 0);
        return (
            (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
        );
    });

    const hydrated = await Promise.all(
        merged.map(async (applet) => {
            const idStr = String(applet._id);
            const isOwner = String(applet.owner) === String(userId);
            const share = shareByEntityId.get(idStr);
            const recipient = share?.recipients?.find(
                (entry) => String(entry.userId) === String(userId),
            );

            return {
                ...applet,
                ...(await getCanvasAppletEditableFileInfo(applet, user)),
                isOwner,
                isShared: !isOwner,
                shareRole: isOwner ? "editor" : recipient?.role || "viewer",
                isSharedOut: isOwner ? shareHasActiveAccess(share) : false,
            };
        }),
    );
    const apps = await maybeLean(
        App.find({
            appletId: { $in: hydrated.map((applet) => applet._id) },
            status: APP_STATUS.ACTIVE,
        }),
    );
    const appByAppletId = await hydrateMissingAppletImageVariants(
        buildCanonicalAppByAppletId(apps),
    );

    return {
        applets: hydrated.map((applet) => ({
            ...applet,
            app: appByAppletId.get(String(applet._id)) || null,
        })),
    };
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
    const applet = await loadAppletWithAccess(user, id, {
        materializeLegacy: true,
    });
    return toRegistryPayload(applet, user);
}

export async function generateAppletMetadata(user, id) {
    const applet = await loadAppletWithAccess(user, id, {
        materializeLegacy: true,
        requireEditor: true,
    });
    const app = await findCanonicalAppletApp(applet._id);
    const html = (await resolveAppletSourceHtml(applet)) || "";
    const text = htmlToPlainText(html);
    const title =
        trimText(extractHtmlTitle(html), APP_METADATA_TEXT_LIMITS.name) ||
        trimText(extractFirstHeading(html), APP_METADATA_TEXT_LIMITS.name) ||
        trimText(app?.name || applet.name, APP_METADATA_TEXT_LIMITS.name) ||
        "Untitled Applet";
    const description =
        trimText(
            extractHtmlMeta(html, "description") ||
                extractHtmlMeta(html, "og:description"),
            APP_METADATA_TEXT_LIMITS.description,
        ) ||
        sentenceFromText(text) ||
        app?.description ||
        "";
    const searchText = `${title} ${description} ${text}`;
    const tags = normalizeTags([
        ...tagsFromText(searchText),
        ...(app?.tags || []),
    ]);
    let imageUrl = app?.imageUrl || null;
    if (!imageUrl) {
        try {
            imageUrl = normalizeImageUrl(extractFirstImage(html));
        } catch {
            imageUrl = null;
        }
    }

    return {
        metadata: {
            name: title,
            slug: slugify(title),
            description,
            icon: app?.icon || pickIconForText(searchText),
            badgeLabel:
                app?.badgeLabel ||
                trimText(
                    app?.category || tags[0] || "Applet",
                    APP_METADATA_TEXT_LIMITS.badgeLabel,
                ),
            imageUrl,
            imageLightUrl: app?.imageLightUrl || imageUrl,
            imageDarkUrl: app?.imageDarkUrl || imageUrl,
            imageAlt:
                app?.imageAlt ||
                trimText(title, APP_METADATA_TEXT_LIMITS.imageAlt),
            tags,
            category: app?.category || tags[0] || null,
            metadataGeneratedAt: new Date().toISOString(),
        },
    };
}

export async function resolveAppletRuntimeHtml(user, id) {
    const applet = await loadAppletWithAccess(user, id, {
        materializeLegacy: true,
    });
    const html = await resolveAppletSourceHtml(applet);
    if (!html) {
        const error = new Error("Applet has no HTML content");
        error.status = 404;
        throw error;
    }

    return {
        applet,
        html: ensureAppletRuntimeHtml(html, {
            appletId: applet._id?.toString?.() || String(applet._id || id),
        }),
    };
}

export async function resolveInstalledAppletRuntime(user, id) {
    const applet = await loadAppletWithAccess(user, id, {
        materializeLegacy: true,
    });
    const versions = versionsOf(applet);
    let html = null;
    let runtimeSource = null;

    if (publishedIndexOf(applet) != null) {
        const publishedHtml = await resolvePublishedAppletContent(applet);
        if (publishedHtml?.trim()) {
            html = publishedHtml;
            runtimeSource = "published";
        }
    }

    if (!html && versions.length > 0) {
        const latestHtml = await resolveAppletVersionContent(
            versions[versions.length - 1],
        );
        if (latestHtml?.trim()) {
            html = latestHtml;
            runtimeSource = "latest-saved";
        }
    }

    if (!html) {
        const draftHtml =
            (await fetchAppletDraftHtml(applet)) ||
            (typeof applet?.html === "string" ? applet.html : "");
        if (draftHtml?.trim()) {
            html = draftHtml;
            runtimeSource = "draft";
        }
    }

    if (!html) {
        const error = new Error("Applet has no runnable HTML content");
        error.status = 404;
        throw error;
    }

    return {
        applet,
        html: ensureAppletRuntimeHtml(html, {
            appletId: applet._id?.toString?.() || String(applet._id || id),
        }),
        runtimeSource,
        publishedVersionIndex: publishedIndexOf(applet),
        latestVersionIndex: versions.length > 0 ? versions.length - 1 : null,
    };
}

export async function updateAppletRegistry(user, id, body = {}) {
    const lockKey = `${user?._id || "unknown"}:${id}`;
    return withAppletMutationLock(lockKey, () =>
        updateAppletRegistryUnlocked(user, id, body),
    );
}

async function updateAppletRegistryUnlocked(user, id, body = {}) {
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
    const applet = await loadAppletWithAccess(user, id, {
        materializeLegacy: true,
        requireEditor: true,
    });
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

    const bodyProvidedHtml = body.html !== undefined;
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
        if (bodyProvidedHtml && isV2(applet)) {
            const { workspacePath } = await getCanvasAppletEditableFileInfo(
                toPlainApplet(applet),
                user,
            );
            const targetWorkspacePath =
                body.workspacePath || workspacePath || null;
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
        }

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

    const didPublish =
        body.publish === true ||
        publishVersion != null ||
        (body.publishToAppStore === true &&
            isV2(savedApplet || applet) &&
            publishedIndexOf(savedApplet || applet) != null);

    if (didPublish && body.publishToAppStore !== true) {
        const targetApplet = savedApplet || applet;
        const publishSharingModeProvided =
            body.publishViaLink !== undefined ||
            body.publishRecipients !== undefined;

        if (body.publishViaLink === true || !publishSharingModeProvided) {
            try {
                await upsertEntityShare({
                    entityType: "applet",
                    entityId: targetApplet._id,
                    ownerId: targetApplet.owner,
                    recipients: [],
                    link: { enabled: true, role: "viewer" },
                    sharedBy: user,
                });
            } catch (error) {
                console.warn(
                    "updateAppletRegistry: failed to enable publish link:",
                    error?.message,
                );
                throw error;
            }
        } else if (body.publishRecipients !== undefined) {
            let recipients;
            try {
                recipients = sanitizeShareRecipients(body.publishRecipients, {
                    ownerId: targetApplet.owner,
                    entityType: "applet",
                });
            } catch (error) {
                error.status = 400;
                throw error;
            }
            if (recipients.length === 0) {
                const error = new Error(
                    "Select at least one person to publish this applet to.",
                );
                error.status = 400;
                throw error;
            }

            try {
                await upsertEntityShare({
                    entityType: "applet",
                    entityId: targetApplet._id,
                    ownerId: targetApplet.owner,
                    recipients,
                    link: { enabled: false, role: "viewer" },
                    sharedBy: user,
                    notificationUrl: publishedAppletUrl(targetApplet._id),
                });
            } catch (error) {
                console.warn(
                    "updateAppletRegistry: failed to apply publish recipients:",
                    error?.message,
                );
                throw error;
            }
        }
    }

    return {
        ...(await toRegistryPayload(savedApplet || applet, user)),
        versionSaved,
        versionDeleted,
        deletedVersion,
        latestVersionIndex,
    };
}

export async function deleteAppletRegistry(user, id) {
    const applet = await Applet.findOne({ _id: id, owner: user._id });
    if (!applet) {
        const error = new Error("Applet not found");
        error.status = 404;
        throw error;
    }
    await deleteCanvasAppletArtifacts(applet, user);
    await Applet.deleteOne({ _id: id, owner: user._id });
    await App.findOneAndUpdate(
        { appletId: id },
        { status: APP_STATUS.INACTIVE },
    );
    await User.collection.updateMany(
        { homeAppletId: id },
        { $unset: { homeAppletId: "" } },
    );
    await User.collection.updateMany(
        { "homeAppletDirectory.appletId": id },
        { $pull: { homeAppletDirectory: { appletId: id } } },
    );
    await User.collection.updateMany(
        { "homeItems.appletId": id },
        { $pull: { homeItems: { appletId: id } } },
    );
    return { success: true };
}
