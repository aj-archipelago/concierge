import { v4 as uuidv4 } from "uuid";
import {
    incrementFileBrowserRefresh,
    openCanvas,
    updateCanvasTab,
} from "../stores/chatSlice";
import { uploadFileToMediaHelper } from "./fileUploadUtils";
import { registerCanvasAppletAfterUpload } from "./registerCanvasAppletAfterUpload";
import { createAppletGlobalStorageTarget } from "./storageTargets";
import { injectAppletIdMeta, injectAppletMetaTags } from "./appletHtmlUtils";

export { injectAppletIdMeta, injectAppletMetaTags } from "./appletHtmlUtils";

const GENERATING_APPLET_TITLE = "Generating applet...";

const LEADING_VERBS = new Set([
    "a",
    "an",
    "the",
    "build",
    "create",
    "generate",
    "make",
    "design",
]);

const NAME_STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "app",
    "applet",
    "for",
    "from",
    "in",
    "of",
    "on",
    "that",
    "the",
    "to",
    "with",
]);

function slugify(value) {
    return (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);
}

function titleCase(words) {
    return words
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function tokenize(value) {
    return (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

function extractNameSource(prompt) {
    const trimmed = (prompt || "").trim();
    if (!trimmed) {
        return "";
    }

    const forMatch = trimmed.match(
        /\bfor\s+(.+?)(?:\s+(?:with|that|using|including|showing|featuring|where)\b|[.!?;,]|$)/i,
    );
    if (forMatch?.[1]) {
        return forMatch[1];
    }

    return trimmed;
}

export function deriveAppletName(prompt) {
    const source = extractNameSource(prompt);
    const words = tokenize(source);

    while (words.length > 0 && LEADING_VERBS.has(words[0])) {
        words.shift();
    }

    let filtered = words.filter((word) => !NAME_STOPWORDS.has(word));
    if (filtered.length === 0) {
        filtered = words;
    }

    const chosenWords = filtered.slice(0, 4);
    return titleCase(chosenWords) || "Generated Applet";
}

export function deriveAppletFilename(
    prompt,
    appletName = deriveAppletName(prompt),
) {
    const nameSlug = slugify(appletName);
    const promptSlug = slugify(prompt);
    return `${nameSlug || promptSlug || "generated"}.html`;
}

export function deriveAppletMetadata(prompt) {
    const appletName = deriveAppletName(prompt);
    return {
        appletName,
        filename: deriveAppletFilename(prompt, appletName),
    };
}

async function readResponseError(response) {
    try {
        const data = await response.json();
        return data?.error || data?.message || response.statusText;
    } catch {
        try {
            return (await response.text()) || response.statusText;
        } catch {
            return response.statusText;
        }
    }
}

function deriveAppletNameFromWorkspacePath(workspacePath) {
    const filename = (workspacePath || "").split("/").pop() || "";
    const baseName = filename.replace(/\.html?$/i, "").trim();
    if (!baseName) {
        return "Registered Applet";
    }

    return baseName
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

async function readWorkspaceAppletHtml(workspacePath) {
    const params = new URLSearchParams({ path: workspacePath });
    const response = await fetch(`/api/workspace/file?${params}`);
    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }

    const html = await response.text();
    if (!html) {
        throw new Error("Empty file content from workspace");
    }

    return html;
}

function buildWorkspaceAppletFilename(workspacePath, appletName) {
    const fileNameFromPath = (workspacePath || "").split("/").pop() || "";
    if (fileNameFromPath) {
        return fileNameFromPath;
    }

    return deriveAppletFilename(appletName || "", appletName);
}

function getAppletWorkspaceUploadSubPath(workspacePath) {
    if (!workspacePath) return null;

    const normalized = workspacePath.replace(/^\/workspace\/files\/?/, "");
    const prefix = "applets/";
    if (!normalized.startsWith(prefix)) return null;

    const relative = normalized.slice(prefix.length);
    const segments = relative.split("/").filter(Boolean);
    if (segments.length <= 1) return null;

    return segments.slice(0, -1).join("/");
}

async function writeWorkspaceAppletHtml({
    workspacePath,
    html,
    userContextId,
    appletName,
}) {
    if (!workspacePath || !userContextId) return null;

    const filename = buildWorkspaceAppletFilename(workspacePath, appletName);
    const blob = new Blob([html], { type: "text/html" });
    const file = new File([blob], filename, { type: "text/html" });
    const uploadResult = await uploadFileToMediaHelper(file, {
        storageTarget: createAppletGlobalStorageTarget(userContextId),
        checkHash: false,
        subPath: getAppletWorkspaceUploadSubPath(workspacePath),
    });

    if (!uploadResult?.url && !uploadResult?.hash) {
        throw new Error("Failed to write registered applet HTML to workspace");
    }

    return uploadResult;
}

export async function registerCanvasAppletFromWorkspaceFile({
    workspacePath,
    appletName,
    userContextId,
}) {
    const resolvedName =
        (appletName || "").trim() ||
        deriveAppletNameFromWorkspacePath(workspacePath);
    const workspaceHtml = await readWorkspaceAppletHtml(workspacePath);
    const taggedHtml = injectAppletMetaTags(workspaceHtml, resolvedName);

    const createResponse = await fetch("/api/canvas-applets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: resolvedName,
            workspacePath,
            html: taggedHtml,
        }),
    });
    if (!createResponse.ok) {
        throw new Error(await readResponseError(createResponse));
    }

    const createdApplet = await createResponse.json();
    const appletId = String(createdApplet?._id || "");
    if (!appletId) {
        throw new Error("Applet registration did not return an applet ID");
    }

    const registeredHtml = injectAppletIdMeta(taggedHtml, appletId);
    const workspaceUpload = await writeWorkspaceAppletHtml({
        workspacePath,
        html: registeredHtml,
        userContextId,
        appletName: resolvedName,
    });
    const updateResponse = await fetch(`/api/canvas-applets/${appletId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            workspacePath,
            html: registeredHtml,
            ...(workspaceUpload?.url ? { filePath: workspaceUpload.url } : {}),
        }),
    });
    if (!updateResponse.ok) {
        throw new Error(await readResponseError(updateResponse));
    }

    const updatedApplet = await updateResponse.json();

    return {
        appletId,
        appletName: updatedApplet?.name || createdApplet?.name || resolvedName,
        filename: buildWorkspaceAppletFilename(workspacePath, resolvedName),
        workspacePath,
        html: registeredHtml,
        applet: updatedApplet,
    };
}

async function readAppletStream(response, onChunk) {
    const reader = response.body?.getReader?.();
    if (!reader) {
        throw new Error("Applet generation stream was unavailable");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";
    let finalHtml = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
            const line = block
                .split("\n")
                .find((entry) => entry.startsWith("data: "));
            if (!line) continue;

            let payload;
            try {
                payload = JSON.parse(line.slice(6));
            } catch {
                continue;
            }

            const { event, data } = payload || {};
            if (event === "data" && data?.chunk) {
                accumulated += data.chunk;
                onChunk?.(accumulated);
            } else if (event === "complete" && data?.html) {
                finalHtml = data.html;
            } else if (event === "error") {
                throw new Error(data?.error || "Applet generation failed");
            }
        }
    }

    if (!finalHtml) {
        finalHtml = accumulated.trim();
    }

    if (!finalHtml) {
        throw new Error("No applet was generated");
    }

    return finalHtml;
}

export function launchAppletGeneration({
    prompt,
    dispatch,
    userContextId = null,
    tabId = uuidv4(),
    appletName: appletNameOverride = null,
    filename: filenameOverride = null,
    reloadFiles,
    onSuccess,
    onError,
    onSaveError,
    onSettled,
}) {
    const trimmedPrompt = (prompt || "").trim();
    if (!trimmedPrompt) {
        throw new Error("A prompt describing the applet is required.");
    }
    if (!dispatch) {
        throw new Error("Redux dispatch is required for applet generation.");
    }

    const derivedMetadata = deriveAppletMetadata(trimmedPrompt);
    const appletName =
        (appletNameOverride || "").trim() || derivedMetadata.appletName;
    const filename =
        (filenameOverride || "").trim() ||
        deriveAppletFilename(trimmedPrompt, appletName);

    dispatch(
        openCanvas({
            tabId,
            type: "html",
            title: GENERATING_APPLET_TITLE,
            filename,
            htmlContent: "",
            htmlStatus: "generating",
        }),
    );

    const completion = (async () => {
        try {
            const response = await fetch("/api/generate-applet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: trimmedPrompt }),
            });

            if (!response.ok) {
                throw new Error(await readResponseError(response));
            }

            const finalHtml = await readAppletStream(
                response,
                (htmlContent) => {
                    dispatch(
                        updateCanvasTab({
                            tabId,
                            content: {
                                htmlContent,
                                htmlStatus: "generating",
                            },
                        }),
                    );
                },
            );

            const taggedHtml = injectAppletMetaTags(finalHtml, appletName);
            dispatch(
                updateCanvasTab({
                    tabId,
                    content: {
                        htmlContent: taggedHtml,
                        htmlStatus: null,
                        htmlError: null,
                        title: filename,
                        filename,
                    },
                }),
            );

            const result = {
                tabId,
                appletId: null,
                appletName,
                filename,
                html: taggedHtml,
                saved: false,
                workspacePath: null,
            };

            if (userContextId) {
                try {
                    const blob = new Blob([taggedHtml], {
                        type: "text/html",
                    });
                    const file = new File([blob], filename, {
                        type: "text/html",
                    });

                    const uploadResult = await uploadFileToMediaHelper(file, {
                        storageTarget:
                            createAppletGlobalStorageTarget(userContextId),
                        checkHash: false,
                    });

                    if (uploadResult?.hash && uploadResult?.url) {
                        if (typeof reloadFiles === "function") {
                            await reloadFiles();
                        } else {
                            dispatch(incrementFileBrowserRefresh());
                        }

                        const {
                            appletId,
                            html: registeredHtml,
                            effectiveUpload,
                        } = await registerCanvasAppletAfterUpload({
                            taggedHtml,
                            filename,
                            appletName,
                            contextId: userContextId,
                            initialUploadResult: uploadResult,
                        });

                        result.saved = true;
                        result.appletId = appletId;
                        result.html = registeredHtml;
                        result.filename =
                            effectiveUpload.displayFilename || filename;
                        result.url = effectiveUpload.url;
                        result.fileHash = effectiveUpload.hash;
                        result.workspacePath = effectiveUpload.name
                            ? `/workspace/files/${effectiveUpload.name.replace(/^\//, "")}`
                            : null;

                        dispatch(
                            updateCanvasTab({
                                tabId,
                                content: {
                                    appletId,
                                    fileHash: effectiveUpload.hash,
                                    filename: result.filename,
                                    title: result.filename,
                                    url: effectiveUpload.url,
                                    htmlContent: registeredHtml,
                                    workspacePath: result.workspacePath,
                                },
                            }),
                        );
                    }
                } catch (saveError) {
                    onSaveError?.(saveError, result);
                }
            }

            onSuccess?.(result);
            return result;
        } catch (error) {
            const message = error?.message || "Applet generation failed";
            dispatch(
                updateCanvasTab({
                    tabId,
                    content: {
                        htmlStatus: "error",
                        htmlError: message,
                    },
                }),
            );
            onError?.(error, { tabId, appletName, filename });
            throw error;
        } finally {
            onSettled?.();
        }
    })();

    return {
        tabId,
        appletName,
        filename,
        completion,
    };
}
