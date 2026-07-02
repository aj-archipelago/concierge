import { NextResponse } from "next/server";
import { Types } from "mongoose";
import Chat from "../../models/chat.mjs";
import MediaItem from "../../models/media-item.mjs";
import Applet from "../../models/applet.js";
import Automation from "../../models/automation.js";
import { getCurrentUser, handleError } from "../../utils/auth";
import {
    normalizeFileMetadataPath,
    titleFromFileMetadataPath,
} from "../../../../src/utils/fileMetadataCatalog";

const MAX_KEYS = 1000;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

function uniqueStrings(values) {
    return Array.from(
        new Set(
            (Array.isArray(values) ? values : [])
                .map(normalizeFileMetadataPath)
                .filter(Boolean)
                .slice(0, MAX_KEYS),
        ),
    );
}

function collectIds(paths, prefix) {
    const ids = new Set();
    for (const path of paths) {
        const [root, id] = normalizeFileMetadataPath(path).split("/");
        if (root === prefix && id && OBJECT_ID_RE.test(id)) {
            ids.add(id);
        }
    }
    return Array.from(ids);
}

function collectAutomationSlugs(paths) {
    const slugs = new Set();
    for (const path of paths) {
        const [root, slug] = normalizeFileMetadataPath(path).split("/");
        if (root === "automations" && slug) {
            slugs.add(slug);
        }
    }
    return Array.from(slugs);
}

function fileMetadataFromMediaItem(item) {
    return {
        kind: item.type || "media",
        displayName:
            item.displayName || titleFromFileMetadataPath(item.blobPath),
        prompt: item.prompt,
        type: item.type,
        status: item.status,
        model: item.model,
        thumbnailUrl: item.thumbnailAzureUrl || item.thumbnailUrl || null,
        thumbnailAzureUrl: item.thumbnailAzureUrl || item.thumbnailUrl || null,
        thumbnailGcsUrl: item.thumbnailGcsUrl || null,
        thumbnailBlobPath: item.thumbnailBlobPath || null,
        thumbnailHash: item.thumbnailHash || null,
        _mediaItem: {
            _id: String(item._id),
            type: item.type,
            status: item.status,
            prompt: item.prompt,
            model: item.model,
            thumbnailUrl: item.thumbnailAzureUrl || item.thumbnailUrl || null,
            thumbnailAzureUrl:
                item.thumbnailAzureUrl || item.thumbnailUrl || null,
            thumbnailGcsUrl: item.thumbnailGcsUrl || null,
            thumbnailBlobPath: item.thumbnailBlobPath || null,
            thumbnailHash: item.thumbnailHash || null,
            error: item.error || null,
        },
    };
}

export async function POST(req) {
    try {
        const currentUser = await getCurrentUser(false);
        if (!currentUser?._id || currentUser.userId === "nodb") {
            return NextResponse.json({ folders: {}, files: {} });
        }

        const body = await req.json().catch(() => ({}));
        const folderPaths = uniqueStrings(body.folderPaths);
        const blobPaths = uniqueStrings(body.blobPaths);
        const allPaths = [...folderPaths, ...blobPaths];
        const folders = {};
        const files = {};

        const chatIds = collectIds(allPaths, "chats");
        if (chatIds.length > 0) {
            const chats = await Chat.find(
                {
                    _id: { $in: chatIds.map((id) => new Types.ObjectId(id)) },
                    userId: currentUser._id,
                },
                {
                    _id: 1,
                    title: 1,
                    titleSetByUser: 1,
                    lastMessagePreview: 1,
                    updatedAt: 1,
                },
            ).lean();

            for (const chat of chats) {
                const id = String(chat._id);
                const displayName =
                    chat.title ||
                    chat.lastMessagePreview ||
                    titleFromFileMetadataPath(id) ||
                    id;
                folders[`chats/${id}`] = {
                    kind: "chat",
                    entityId: id,
                    displayName,
                    updatedAt: chat.updatedAt || null,
                };
            }
        }

        const automationSlugs = collectAutomationSlugs(allPaths);
        if (automationSlugs.length > 0) {
            const automations = await Automation.find(
                {
                    owner: currentUser._id,
                    slug: { $in: automationSlugs },
                },
                { _id: 1, slug: 1, name: 1, updatedAt: 1 },
            ).lean();
            for (const automation of automations) {
                folders[`automations/${automation.slug}`] = {
                    kind: "automation",
                    entityId: String(automation._id),
                    displayName: automation.name || automation.slug,
                    updatedAt: automation.updatedAt || null,
                };
            }
        }

        const mediaBlobPaths = blobPaths.filter((path) =>
            path.startsWith("media/"),
        );
        if (mediaBlobPaths.length > 0) {
            const mediaItems = await MediaItem.find(
                {
                    user: currentUser._id,
                    $or: [
                        { blobPath: { $in: mediaBlobPaths } },
                        { thumbnailBlobPath: { $in: mediaBlobPaths } },
                    ],
                },
                {
                    _id: 1,
                    blobPath: 1,
                    prompt: 1,
                    type: 1,
                    status: 1,
                    model: 1,
                    thumbnailUrl: 1,
                    thumbnailAzureUrl: 1,
                    thumbnailGcsUrl: 1,
                    thumbnailBlobPath: 1,
                    thumbnailHash: 1,
                    error: 1,
                },
            ).lean();
            for (const item of mediaItems) {
                if (item.blobPath) {
                    files[normalizeFileMetadataPath(item.blobPath)] =
                        fileMetadataFromMediaItem(item);
                }
            }
        }

        const appletBlobPaths = blobPaths.filter((path) =>
            path.startsWith("applets/"),
        );
        if (appletBlobPaths.length > 0) {
            const workspacePaths = appletBlobPaths.map(
                (path) => `/workspace/files/${path}`,
            );
            const applets = await Applet.find(
                {
                    owner: currentUser._id,
                    $or: [
                        { filePath: { $in: workspacePaths } },
                        { publishedContentBlobPath: { $in: appletBlobPaths } },
                        {
                            "htmlVersions.contentBlobPath": {
                                $in: appletBlobPaths,
                            },
                        },
                    ],
                },
                {
                    _id: 1,
                    name: 1,
                    filePath: 1,
                    publishedContentBlobPath: 1,
                    htmlVersions: 1,
                    updatedAt: 1,
                },
            ).lean();
            for (const applet of applets) {
                const candidates = [
                    applet.filePath
                        ? normalizeFileMetadataPath(
                              applet.filePath.replace(
                                  /^\/workspace\/files\/?/,
                                  "",
                              ),
                          )
                        : null,
                    normalizeFileMetadataPath(applet.publishedContentBlobPath),
                    ...(Array.isArray(applet.htmlVersions)
                        ? applet.htmlVersions.map((version) =>
                              normalizeFileMetadataPath(
                                  version?.contentBlobPath,
                              ),
                          )
                        : []),
                ].filter(Boolean);
                for (const path of candidates) {
                    files[path] = {
                        kind: "applet",
                        entityId: String(applet._id),
                        displayName:
                            applet.name || titleFromFileMetadataPath(path),
                        appletId: String(applet._id),
                        updatedAt: applet.updatedAt || null,
                    };
                }
            }
        }

        for (const path of blobPaths) {
            if (path.startsWith("articles/") && !files[path]) {
                files[path] = {
                    kind: "article",
                    displayName: titleFromFileMetadataPath(path),
                };
            }
        }

        return NextResponse.json({ folders, files });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
