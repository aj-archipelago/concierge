import AppletData from "../models/applet-data";
import AppletFile from "../models/applet-file";
import AppletSharedData from "../models/applet-shared-data";
import AppletSharedDataRevision from "../models/applet-shared-data-revision";
import AppletSharedFile from "../models/applet-shared-file";
import File from "../models/file";
import { deleteMediaFile } from "../utils/media-service-utils";
import {
    createAppletGlobalStorageTarget,
    createAppletSharedStorageTarget,
    createAppletUserStorageTarget,
    createUserGlobalStorageTarget,
} from "../../../src/utils/storageTargets";
import { resolveCanvasAppletPrimaryFile } from "./files";
import {
    deleteAppletVersionSnapshots,
    deletePublishedAppletSnapshot,
} from "./versioning";

function dedupeFiles(files = []) {
    const seen = new Set();
    return files.filter((file) => {
        if (!file?._id) {
            return false;
        }
        const key = String(file._id);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function isV2Applet(applet) {
    return Number(applet?.version || 1) === 2;
}

async function deleteAppletCloudFiles(files, storageTarget) {
    if (!storageTarget) {
        return;
    }

    await Promise.allSettled(
        files.map((file) =>
            deleteMediaFile({
                blobPath: file?.blobPath || null,
                hash: file?.hash || null,
                fallbackToHash: false,
                storageTarget,
            }),
        ),
    );
}

export async function deleteCanvasAppletArtifacts(applet, user) {
    const [appletFiles, sharedFiles] = await Promise.all([
        AppletFile.findOne({
            appletId: applet._id,
            userId: user._id,
        }).populate("files"),
        AppletSharedFile.findOne({
            appletId: applet._id,
        }).populate("files"),
    ]);
    const primaryFile = await resolveCanvasAppletPrimaryFile(applet, user);
    const userFilesToDelete = dedupeFiles(appletFiles?.files || []);
    const sharedFilesToDelete = dedupeFiles(sharedFiles?.files || []);
    const primaryFilesToDelete = dedupeFiles(primaryFile ? [primaryFile] : []);
    const shouldDeleteLegacyPrimaryFiles = !isV2Applet(applet);
    const userFileIds = new Set(
        userFilesToDelete.map((file) => String(file?._id)).filter(Boolean),
    );
    const primaryFilesNeedingLegacyDelete = shouldDeleteLegacyPrimaryFiles
        ? primaryFilesToDelete.filter(
              (file) => !userFileIds.has(String(file?._id)),
          )
        : [];
    const filesToDelete = dedupeFiles([
        ...userFilesToDelete,
        ...sharedFilesToDelete,
        ...primaryFilesToDelete,
    ]);

    await Promise.allSettled([
        deleteAppletCloudFiles(
            userFilesToDelete,
            createAppletUserStorageTarget(
                user?.contextId || null,
                applet?._id?.toString() || null,
            ),
        ),
        deleteAppletCloudFiles(
            sharedFilesToDelete,
            createAppletSharedStorageTarget(applet?._id?.toString() || null),
        ),
        deleteAppletCloudFiles(
            primaryFilesToDelete,
            createAppletGlobalStorageTarget(user?.contextId || null),
        ),
        // Legacy: applets used to live under the user's global folder before
        // the dedicated applets/ scope existed. Try that path too so we don't
        // leave orphaned files for older applets.
        shouldDeleteLegacyPrimaryFiles
            ? deleteAppletCloudFiles(
                  primaryFilesToDelete,
                  createUserGlobalStorageTarget(user?.contextId || null),
              )
            : Promise.resolve(),
        shouldDeleteLegacyPrimaryFiles
            ? deleteAppletCloudFiles(
                  primaryFilesNeedingLegacyDelete,
                  createAppletUserStorageTarget(
                      user?.contextId || null,
                      applet?._id?.toString() || null,
                  ),
              )
            : Promise.resolve(),
        deleteAppletVersionSnapshots(applet?.htmlVersions || [], user),
        deletePublishedAppletSnapshot(applet),
    ]);

    await Promise.all([
        AppletData.deleteMany({ appletId: applet._id, userId: user._id }),
        AppletFile.deleteMany({ appletId: applet._id, userId: user._id }),
        AppletSharedData.deleteMany({ appletId: applet._id }),
        AppletSharedDataRevision.deleteMany({ appletId: applet._id }),
        AppletSharedFile.deleteMany({ appletId: applet._id }),
        filesToDelete.length > 0
            ? File.deleteMany({
                  _id: {
                      $in: filesToDelete.map((file) => file._id),
                  },
              })
            : Promise.resolve(),
    ]);

    return {
        deletedFileCount: filesToDelete.length,
    };
}
