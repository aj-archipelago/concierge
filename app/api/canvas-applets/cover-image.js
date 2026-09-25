import {
    isManagedStorageUrl,
    isLocalStorageUrl,
    getStorageContainerPrefixes,
} from "../../../src/utils/storageOrigins";
import App, { APP_STATUS, APP_TYPES } from "../models/app";
import MediaItem from "../models/media-item.mjs";
import User from "../models/user.mjs";
import Applet from "../models/applet";
import { validateAppletAccess } from "../applet/access.js";

const COVER_FIELDS = ["imageUrl", "imageLightUrl", "imageDarkUrl"];
const MEDIA_URL_FIELDS = ["azureUrl", "url", "gcsUrl"];

function coverError(message, status) {
    return Object.assign(new Error(message), { status });
}

function blobIdentity(value) {
    try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
    } catch {
        return null;
    }
}

export function isSameCoverBlob(first, second) {
    const identity = blobIdentity(first);
    return Boolean(identity && identity === blobIdentity(second));
}

function parseGeneratedCover(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    const azurite = isLocalStorageUrl(url);
    if (!isManagedStorageUrl(url)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (azurite) {
        if (parts.shift() !== "devstoreaccount1") return null;
    }
    const container = parts.shift();
    const blobPath = parts.join("/");
    const match = blobPath.match(
        /^(?:applets\/)?assets\/([a-f0-9]{24})\/card-art-(?:light|dark)-[a-zA-Z0-9_-]+\.(?:png|webp|jpe?g)$/,
    );
    if (!match) return null;
    return {
        appletId: match[1],
        container,
        blobPath,
        containerBases: getStorageContainerPrefixes(),
    };
}

export function isGeneratedAppletCoverUrl(url) {
    return Boolean(parseGeneratedCover(url));
}

/** Resolve only saved, generated covers; never infer storage authority from a caller's contextId. */
export async function resolveAppletCoverRefreshTarget(user, url) {
    const cover = parseGeneratedCover(url);
    if (!cover) return null;
    // Reuse the same owner/share/published access policy as the applet runtime.
    // Defaults deliberately avoid materializing or changing legacy records.
    const denied = await validateAppletAccess(cover.appletId, user);
    if (denied)
        throw coverError("Applet cover is not accessible", denied.status);
    const applet = await Applet.findById(cover.appletId).select("owner").lean();
    if (!applet) throw coverError("Applet cover not found", 404);
    const apps = await App.find({
        appletId: applet._id,
        type: APP_TYPES.APPLET,
        status: APP_STATUS.ACTIVE,
    })
        .select(COVER_FIELDS.join(" "))
        .lean();
    if (!apps.length) throw coverError("Applet cover not found", 404);

    const mediaItems = await MediaItem.find({
        outputFolder: {
            $in: [
                `assets/${cover.appletId}`,
                `applets/assets/${cover.appletId}`,
            ],
        },
        type: "image",
        status: "completed",
        tags: "applet-card",
    })
        .select("user azureUrl url gcsUrl")
        .lean();
    const matchingMedia = mediaItems.filter((item) =>
        MEDIA_URL_FIELDS.some((field) => isSameCoverBlob(item[field], url)),
    );
    const savedOnApp = apps.some((app) =>
        COVER_FIELDS.some((field) => isSameCoverBlob(app[field], url)),
    );
    // Media records also back the theme variants hydrated into catalog payloads.
    if (!savedOnApp && !matchingMedia.length)
        throw coverError("Applet cover not found", 404);

    // Editors generate into their own storage. A matching media record ties the
    // creator to this specific cover; old owner-generated covers need no record.
    const creatorIds = [
        ...new Set(
            [applet.owner, ...matchingMedia.map((item) => item.user)]
                .filter(Boolean)
                .map(String),
        ),
    ];
    const creators = await User.find({ _id: { $in: creatorIds } })
        .select("contextId")
        .lean();
    const creator = creators.find(
        (candidate) =>
            candidate.contextId &&
            cover.containerBases.some(
                (base) => cover.container === `${base}-${candidate.contextId}`,
            ),
    );
    if (!creator)
        throw coverError("Applet cover storage is not authorized", 403);
    return { blobPath: cover.blobPath, contextId: creator.contextId };
}
