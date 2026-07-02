import Applet from "../models/applet";
import File from "../models/file";
import AppletSharedData from "../models/applet-shared-data";
import AppletSharedFile from "../models/applet-shared-file";
import {
    checkMediaFile,
    hashBuffer,
    uploadBufferToMediaService,
} from "../utils/media-service-utils";
import {
    createAppletSharedStorageTarget,
    createAppletGlobalStorageTarget,
} from "../../../src/utils/storageTargets";
import {
    applyPublishedAppletSnapshot,
    createAppletVersionEntry,
    getAppletVersionBlobPath,
    resolveAppletVersionContent,
    resolvePublishedAppletContent,
} from "./versioning";
import { ensureAppletWorkspaceFile } from "./files";
import { getAppletRegistry } from "./registry";

function assertAdmin(user) {
    if (!user?._id) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }
    if (user.role !== "admin") {
        const error = new Error("Forbidden");
        error.status = 403;
        throw error;
    }
}

function versionsOf(applet) {
    return Array.isArray(applet?.htmlVersions) ? applet.htmlVersions : [];
}

async function readBlobBuffer(blobPath, storageTarget) {
    const fileInfo = await checkMediaFile({ blobPath, storageTarget });
    if (!fileInfo?.url) {
        return null;
    }

    const response = await fetch(fileInfo.url, { cache: "no-store" });
    if (!response.ok) {
        return null;
    }

    return Buffer.from(await response.arrayBuffer());
}

async function copySharedDataRecords(sourceAppletId, targetAppletId, userId) {
    const records = await AppletSharedData.find({
        appletId: sourceAppletId,
    }).lean();

    if (records.length === 0) {
        return;
    }

    await AppletSharedData.insertMany(
        records.map((record) => ({
            appletId: targetAppletId,
            key: record.key,
            value: record.value,
            revision: record.revision,
            createdBy: userId,
            updatedBy: userId,
        })),
    );
}

async function copySharedFileRecords(sourceAppletId, targetAppletId, user) {
    const fileStore = await AppletSharedFile.findOne({
        appletId: sourceAppletId,
    })
        .populate("files")
        .lean();

    const sourceFiles = Array.isArray(fileStore?.files) ? fileStore.files : [];
    if (sourceFiles.length === 0) {
        return;
    }

    const sourceStorageTarget = createAppletSharedStorageTarget(sourceAppletId);
    const targetStorageTarget = createAppletSharedStorageTarget(
        String(targetAppletId),
    );
    const copiedFileIds = [];

    for (const sourceFile of sourceFiles) {
        const blobPath = sourceFile.blobPath;
        if (!blobPath) {
            continue;
        }

        const buffer = await readBlobBuffer(blobPath, sourceStorageTarget);
        if (!buffer) {
            continue;
        }

        const hash = sourceFile.hash || (await hashBuffer(buffer));
        const uploadResult = await uploadBufferToMediaService(
            buffer,
            {
                filename: sourceFile.filename,
                mimeType: sourceFile.mimeType || "application/octet-stream",
                size: buffer.length,
                hash,
            },
            {
                storageTarget: targetStorageTarget,
            },
        );

        if (uploadResult?.error || !uploadResult?.data?.url) {
            continue;
        }

        const uploaded = uploadResult.data;
        const newFile = await File.create({
            filename: sourceFile.filename,
            originalName: sourceFile.originalName || sourceFile.filename,
            mimeType: sourceFile.mimeType || "application/octet-stream",
            size: buffer.length,
            url: uploaded.converted?.url || uploaded.url,
            gcsUrl: uploaded.converted?.url || uploaded.url,
            hash: uploaded.hash || hash,
            blobPath: uploaded.blobPath || uploaded.blobName || null,
            owner: user._id,
        });
        copiedFileIds.push(newFile._id);
    }

    if (copiedFileIds.length === 0) {
        return;
    }

    await AppletSharedFile.findOneAndUpdate(
        { appletId: targetAppletId },
        {
            $push: {
                files: { $each: copiedFileIds },
            },
        },
        {
            upsert: true,
            new: true,
            runValidators: true,
        },
    );
}

async function resolveSourceVersionHtml(sourceApplet, version) {
    const inline =
        typeof version?.content === "string" && version.content.length > 0
            ? version.content
            : null;
    if (inline) {
        return inline;
    }

    const blobPath = getAppletVersionBlobPath(version);
    if (blobPath && version?.contentContextId) {
        const buffer = await readBlobBuffer(
            blobPath,
            createAppletGlobalStorageTarget(version.contentContextId),
        );
        if (buffer) {
            return buffer.toString("utf8");
        }
    }

    return (await resolveAppletVersionContent(version)) || "";
}

export async function copyAppletForAdmin(user, sourceAppletId) {
    assertAdmin(user);

    const sourceApplet = await Applet.findById(sourceAppletId);
    if (!sourceApplet) {
        const error = new Error("Applet not found");
        error.status = 404;
        throw error;
    }

    if (Number(sourceApplet.version || 1) !== 2) {
        const error = new Error("Only canvas (v2) applets can be copied");
        error.status = 400;
        throw error;
    }

    if (sourceApplet.publishedVersionIndex == null) {
        const error = new Error("Applet is not published");
        error.status = 400;
        throw error;
    }

    if (String(sourceApplet.owner) === String(user._id)) {
        const error = new Error("This applet already belongs to your account");
        error.status = 400;
        throw error;
    }

    const sourceName = sourceApplet.name || "Untitled Applet";
    const newApplet = await Applet.create({
        owner: user._id,
        name: `Copy of ${sourceName}`,
        html: "",
        version: 2,
        htmlVersions: [],
        suggestions: Array.isArray(sourceApplet.suggestions)
            ? sourceApplet.suggestions
            : [],
    });

    const sourceVersions = versionsOf(sourceApplet);
    const copiedVersions = [];

    for (let index = 0; index < sourceVersions.length; index += 1) {
        const html = await resolveSourceVersionHtml(
            sourceApplet,
            sourceVersions[index],
        );
        if (!html) {
            continue;
        }

        const entry = await createAppletVersionEntry(newApplet, user, html, {
            versionIndex: copiedVersions.length,
            external: true,
        });
        copiedVersions.push(entry);
    }

    if (copiedVersions.length === 0) {
        const fallbackHtml = await resolvePublishedAppletContent(sourceApplet);
        if (fallbackHtml) {
            const entry = await createAppletVersionEntry(
                newApplet,
                user,
                fallbackHtml,
                {
                    versionIndex: 0,
                    external: true,
                },
            );
            copiedVersions.push(entry);
        }
    }

    newApplet.htmlVersions = copiedVersions;

    const publishedIndex =
        typeof sourceApplet.publishedVersionIndex === "number"
            ? sourceApplet.publishedVersionIndex
            : null;

    if (
        publishedIndex != null &&
        publishedIndex >= 0 &&
        publishedIndex < copiedVersions.length
    ) {
        newApplet.publishedVersionIndex = publishedIndex;
        const publishedHtml = await resolveAppletVersionContent(
            copiedVersions[publishedIndex],
        );
        if (publishedHtml) {
            await applyPublishedAppletSnapshot(newApplet, publishedHtml, {
                versionIndex: publishedIndex,
            });
        }
    } else if (copiedVersions.length === 1) {
        newApplet.publishedVersionIndex = 0;
        const publishedHtml = await resolveAppletVersionContent(
            copiedVersions[0],
        );
        if (publishedHtml) {
            await applyPublishedAppletSnapshot(newApplet, publishedHtml, {
                versionIndex: 0,
            });
        }
    }

    await newApplet.save();

    await Promise.all([
        copySharedDataRecords(sourceApplet._id, newApplet._id, user._id),
        copySharedFileRecords(sourceApplet._id, newApplet._id, user),
    ]);

    const materialized = await ensureAppletWorkspaceFile(
        newApplet.toObject(),
        user,
    );
    if (
        materialized?.filePath &&
        materialized.filePath !== newApplet.filePath
    ) {
        newApplet.filePath = materialized.filePath;
        await newApplet.save();
    }

    return getAppletRegistry(user, newApplet._id);
}
