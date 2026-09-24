import crypto from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import Applet from "../../../models/applet";
import {
    checkMediaFile,
    deleteMediaFile,
    hashBuffer,
    listMediaFiles,
    uploadBufferToMediaService,
} from "../../../utils/media-service-utils";
import { fetchAllowedBlobUrl } from "../../../utils/llm-file-utils";
import {
    createAgentContextStorageTarget,
    createChatStorageTarget,
} from "../../../../../src/utils/storageTargets";
import { getCanvasAppletForDataAccess } from "../utils";

const CONTEXT_PATTERN = /^applet-shared:([A-Fa-f0-9]{24})$/;
const SAFE_DIRECTORY_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

function json(body, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
    });
}

function canManage(access) {
    return (
        access.user.role === "admin" ||
        String(access.applet.owner) === String(access.user._id) ||
        access.access?.role === "editor"
    );
}

function ownsContext(access) {
    return (
        access.user.role === "admin" ||
        String(access.applet.owner) === String(access.user._id)
    );
}

function parseContext(value) {
    const match = String(value || "").match(CONTEXT_PATTERN);
    return match ? { value: match[0], contextId: match[1] } : null;
}

function safeFilename(value) {
    const name = String(value || "").trim();
    return name &&
        name !== "." &&
        name !== ".." &&
        name.length <= 255 &&
        !/[/\\\0]/.test(name) &&
        path.posix.basename(name) === name
        ? name
        : null;
}

function safeDirectory(value) {
    const directory = String(value || "").trim();
    if (!directory) return "";
    return directory.length <= 1024 && SAFE_DIRECTORY_PATTERN.test(directory)
        ? directory
        : null;
}

function storageTarget(contextId) {
    return createAgentContextStorageTarget(`applet-shared:${contextId}`);
}

function relativeContextPath(file) {
    const blobPath = file?.blobPath || file?.name || "";
    const relative = blobPath.startsWith("applet-shared/")
        ? blobPath.slice("applet-shared/".length)
        : blobPath;
    return relative.includes("/")
        ? relative
        : file?.displayFilename || relative;
}

async function upload(contextId, directory, filename, buffer, mimeType) {
    const result = await uploadBufferToMediaService(
        buffer,
        { filename, mimeType, hash: await hashBuffer(buffer) },
        {
            storageTarget: storageTarget(contextId),
            subPath: directory || null,
        },
    );
    if (result.error) return { error: result.error };
    return { file: result.data };
}

async function uploadText(contextId, directory, filename, content) {
    return upload(
        contextId,
        directory,
        filename,
        Buffer.from(content, "utf8"),
        filename.endsWith(".json") ? "application/json" : "text/markdown",
    );
}

async function resolveContext(access, requested = null) {
    const parsed = parseContext(requested || access.applet.agentContext);
    if (!parsed) return null;
    const sourceApplet = await Applet.findOne({
        agentContext: parsed.value,
        ...(access.user.role === "admin" ? {} : { owner: access.user._id }),
    })
        .select("_id")
        .lean();
    const source = sourceApplet
        ? await getCanvasAppletForDataAccess(sourceApplet._id)
        : null;
    return !source || source.error ? null : { ...parsed, access: source };
}

export async function GET(_request, { params }) {
    const { id } = await params;
    const access = await getCanvasAppletForDataAccess(id);
    if (access.error) return access.error;
    const manageable = canManage(access);
    return json({
        appletId: id,
        attached: Boolean(access.applet.agentContext),
        canManage: manageable,
    });
}

export async function POST(request, { params }) {
    const { id } = await params;
    const body = await request.json();
    const access = await getCanvasAppletForDataAccess(id);
    if (access.error) return access.error;

    if (!canManage(access)) return json({ error: "Forbidden" }, 403);

    if (body.action === "initialize") {
        if (!ownsContext(access)) return json({ error: "Forbidden" }, 403);
        const contextValue =
            body.agentContext ||
            `applet-shared:${crypto.randomBytes(12).toString("hex")}`;
        const context = body.agentContext
            ? await resolveContext(access, contextValue)
            : { ...parseContext(contextValue), access };
        if (!context || (body.agentContext && !ownsContext(context.access))) {
            return json({ error: "Context owner is not manageable" }, 403);
        }
        await Applet.findByIdAndUpdate(id, { agentContext: contextValue });
        return json({ success: true, agentContext: contextValue });
    }

    const context = parseContext(access.applet.agentContext);
    if (!context) {
        return json({ error: "Agent context is not manageable" }, 403);
    }

    if (body.action === "list") {
        return json({
            agentContext: context.value,
            files: await listMediaFiles({
                storageTarget: storageTarget(context.contextId),
            }),
        });
    }

    if (body.action === "upsert") {
        const filename = safeFilename(body.filename);
        const directory = safeDirectory(body.directory);
        if (!filename || directory === null) {
            return json({ error: "Invalid context path" }, 400);
        }
        const existingRootFiles = directory
            ? []
            : (
                  await listMediaFiles({
                      storageTarget: storageTarget(context.contextId),
                  })
              ).filter((file) => relativeContextPath(file) === filename);
        let result;
        if (body.sourceBlobPath) {
            const chatId = String(body.sourceBlobPath).match(
                /^chats\/([^/]+)\//,
            )?.[1];
            const source =
                chatId &&
                (await checkMediaFile({
                    blobPath: body.sourceBlobPath,
                    hash: body.sourceHash || null,
                    storageTarget: createChatStorageTarget(
                        access.user.contextId,
                        chatId,
                    ),
                }));
            if (!source?.url)
                return json({ error: "Source file not found" }, 404);
            const response = await fetchAllowedBlobUrl(source.url);
            if (!response.ok)
                return json({ error: "Source file unreadable" }, 400);
            result = await upload(
                context.contextId,
                directory,
                filename,
                Buffer.from(await response.arrayBuffer()),
                body.sourceMimeType ||
                    source.mimeType ||
                    "application/octet-stream",
            );
        } else if (typeof body.content === "string" && body.content) {
            result = await uploadText(
                context.contextId,
                directory,
                filename,
                body.content,
            );
        } else {
            return json(
                { error: "content or sourceBlobPath is required" },
                400,
            );
        }
        if (!result.error) {
            await Promise.all(
                existingRootFiles
                    .filter(
                        (file) =>
                            (file.blobPath || file.name) !==
                            result.file?.blobPath,
                    )
                    .map((file) =>
                        deleteMediaFile({
                            blobPath: file.blobPath || file.name,
                            fallbackToHash: false,
                            storageTarget: storageTarget(context.contextId),
                        }),
                    ),
            );
        }
        return result.error
            ? result.error
            : json({ success: true, file: result.file });
    }

    return json({ error: "Unsupported action" }, 400);
}
