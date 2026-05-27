import Applet from "../models/applet";
import File from "../models/file";
import {
    checkMediaFile,
    hashBuffer,
    uploadBufferToMediaService,
} from "../utils/media-service-utils";
import { createAppletGlobalStorageTarget } from "../../../src/utils/storageTargets";
import {
    injectAppletIdMeta,
    injectAppletMetaTags,
} from "../../../src/utils/appletHtmlUtils";
import { resolveAppletVersionContent } from "./versioning";

const WORKSPACE_FILES_PREFIX = "/workspace/files/";

export function extractBlobPathFromUrl(blobUrl) {
    try {
        const urlObj = new URL(blobUrl);
        const segments = urlObj.pathname.split("/").filter(Boolean);
        const isAzurite =
            urlObj.hostname === "127.0.0.1" || urlObj.hostname === "localhost";
        const skip = isAzurite ? 2 : 1;
        if (segments.length <= skip) return null;
        return segments.slice(skip).map(decodeURIComponent).join("/");
    } catch {
        return null;
    }
}

export function buildWorkspacePathFromBlobPath(blobPath) {
    return blobPath ? `/workspace/files/${blobPath}` : null;
}

export function extractBlobPathFromWorkspacePath(workspacePath) {
    if (
        !workspacePath ||
        typeof workspacePath !== "string" ||
        !workspacePath.startsWith(WORKSPACE_FILES_PREFIX)
    ) {
        return null;
    }

    return workspacePath.slice(WORKSPACE_FILES_PREFIX.length) || null;
}

function endsWithHtml(value) {
    return (
        typeof value === "string" &&
        value.trim().toLowerCase().endsWith(".html")
    );
}

export function isCanvasAppletHtmlFile(file) {
    if (!file) {
        return false;
    }

    if (file.mimeType === "text/html") {
        return true;
    }

    return [
        file.displayFilename,
        file.filename,
        file.originalName,
        file.blobPath,
        file.url,
        file.gcsUrl,
    ].some(endsWithHtml);
}

export async function resolveCanvasAppletFileByWorkspacePath(
    workspacePath,
    user,
) {
    const blobPath = extractBlobPathFromWorkspacePath(workspacePath);
    if (!blobPath || !user?.contextId) {
        return null;
    }

    const resolvedFile = await checkMediaFile({
        blobPath,
        userId: user.contextId,
    });

    if (!resolvedFile?.url) {
        return null;
    }

    return {
        ...resolvedFile,
        blobPath: resolvedFile.blobPath || blobPath,
    };
}

export async function resolveCanvasAppletPrimaryFile(applet, user) {
    if (!applet?.filePath || !user?._id) {
        return null;
    }

    const matchQuery = [{ url: applet.filePath }, { gcsUrl: applet.filePath }];
    const blobPath = extractBlobPathFromUrl(applet.filePath);
    if (blobPath) {
        matchQuery.push({ blobPath });
    }

    return File.findOne({
        owner: user._id,
        $or: matchQuery,
    }).lean();
}

export async function getCanvasAppletEditableFileInfo(applet, user) {
    const primaryFile = await resolveCanvasAppletPrimaryFile(applet, user);
    const blobPath =
        primaryFile?.blobPath || extractBlobPathFromUrl(applet?.filePath);

    return {
        fileHash: primaryFile?.hash || null,
        fileBlobPath: blobPath || null,
        workspacePath: buildWorkspacePathFromBlobPath(blobPath),
    };
}

function slugifyAppletName(name) {
    const cleaned = (name || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return cleaned || "applet";
}

export function buildAppletFilenameFromWorkspacePath(
    workspacePath,
    appletName = "Applet",
) {
    const fileNameFromPath = (workspacePath || "").split("/").pop() || "";
    if (fileNameFromPath) {
        return fileNameFromPath;
    }

    return `${slugifyAppletName(appletName)}.html`;
}

export function getAppletWorkspaceUploadSubPath(workspacePath) {
    if (!workspacePath) return null;

    const normalized = workspacePath.replace(/^\/workspace\/files\/?/, "");
    const prefix = "applets/";
    if (!normalized.startsWith(prefix)) return null;

    const relative = normalized.slice(prefix.length);
    const segments = relative.split("/").filter(Boolean);
    if (segments.length <= 1) return null;

    return segments.slice(0, -1).join("/");
}

async function pickAppletSourceHtml(applet) {
    if (typeof applet?.html === "string" && applet.html.length > 0) {
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
        return await resolveAppletVersionContent(versions[publishedIndex]);
    }
    const last = versions[versions.length - 1];
    return await resolveAppletVersionContent(last);
}

/**
 * For legacy (v1) applets that have no editable workspace file backing, write
 * the applet's current HTML to the user's applets/ folder via media-helper,
 * persist a File record so getCanvasAppletEditableFileInfo can resolve it,
 * and store filePath on the applet. No-op if filePath is already set.
 *
 * Returns a possibly-updated applet (plain object) on success; on failure
 * returns the original applet unchanged so callers can degrade gracefully.
 */
export async function ensureAppletWorkspaceFile(applet, user) {
    if (!applet || !user?._id) return applet;
    if (applet.filePath) return applet;
    if (!user.contextId) return applet;

    const sourceHtml = await pickAppletSourceHtml(applet);
    if (!sourceHtml) return applet;

    const appletId = applet._id?.toString?.() || String(applet._id);
    const appletName = applet.name || "Applet";
    const taggedHtml = injectAppletIdMeta(
        injectAppletMetaTags(sourceHtml, appletName),
        appletId,
    );

    const filename = `${slugifyAppletName(appletName)}-${appletId}.html`;
    const buffer = Buffer.from(taggedHtml, "utf8");
    const hash = await hashBuffer(buffer);
    const metadata = {
        filename,
        mimeType: "text/html",
        size: buffer.length,
        hash,
    };

    const uploadResult = await uploadBufferToMediaService(buffer, metadata, {
        storageTarget: createAppletGlobalStorageTarget(user.contextId),
    });
    if (uploadResult?.error || !uploadResult?.data?.url) {
        return applet;
    }

    const data = uploadResult.data;
    const fileUrl = data.converted?.url || data.url;
    const gcsUrl = data.converted?.gcs || data.gcs || null;
    const blobPath = data.blobPath || extractBlobPathFromUrl(fileUrl);

    try {
        const fileDoc = new File({
            filename: data.filename || filename,
            originalName: filename,
            mimeType: "text/html",
            size: buffer.length,
            url: fileUrl,
            gcsUrl,
            hash: data.hash || hash,
            blobPath,
            owner: user._id,
        });
        await fileDoc.save();
    } catch (err) {
        // File doc may already exist for the same blob — that's fine.
        console.warn(
            "ensureAppletWorkspaceFile: File document insert skipped:",
            err?.message,
        );
    }

    const updated = await Applet.findByIdAndUpdate(
        applet._id,
        { filePath: fileUrl },
        { new: true },
    ).lean();

    return updated || { ...applet, filePath: fileUrl };
}
