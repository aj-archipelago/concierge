import {
    isManagedStorageUrl,
    isLocalStorageUrl,
    getStorageContainerPrefixes,
} from "../../../src/utils/storageOrigins";
import User from "../models/user";

function imageLocation(value) {
    try {
        const url = new URL(value);
        const local = isLocalStorageUrl(url);
        if (!isManagedStorageUrl(url)) return null;
        const parts = url.pathname.split("/").filter(Boolean);
        if (local && parts.shift() !== "devstoreaccount1") return null;
        const container = parts.shift();
        const blobPath = parts.map(decodeURIComponent).join("/");
        if (!/^profiles?\//.test(blobPath)) return null;
        const bases = getStorageContainerPrefixes();
        const base = bases.find((value) => container?.startsWith(`${value}-`));
        if (!base) return null;
        return { contextId: container.slice(base.length + 1), blobPath };
    } catch {
        return null;
    }
}

/** Profile photos are visible in the authenticated people picker and share lists. */
export async function resolveProfileImageRefreshTarget(user, input) {
    if (!user?._id || user.userId === "anonymous") return null;
    // A recognized saved URL supplies its own identity, not caller routing hints.
    const location = imageLocation(input.url);
    const target =
        location ||
        (input.fileScope === "profile" && input.blobPath && input.contextId
            ? { blobPath: input.blobPath, contextId: input.contextId }
            : null);
    if (!target || !/^profiles?\//.test(target.blobPath)) return null;
    if (target.contextId === user.contextId) return null;
    const owner = await User.findOne({ contextId: target.contextId })
        .select("profilePicture profilePictureBlobPath contextId username")
        .lean();
    const saved = imageLocation(owner?.profilePicture);
    if (
        !owner ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.username || "") ||
        (owner.profilePictureBlobPath !== target.blobPath &&
            !(
                saved?.contextId === target.contextId &&
                saved.blobPath === target.blobPath
            ))
    ) {
        throw Object.assign(new Error("Profile image not found"), {
            status: 404,
        });
    }
    return target;
}

export function matchesProfileImageTarget(url, target) {
    const location = imageLocation(url);
    return Boolean(
        location &&
            location.contextId === target.contextId &&
            location.blobPath === target.blobPath,
    );
}
