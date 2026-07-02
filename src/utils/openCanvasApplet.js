import { getTextProxyUrl } from "./proxyUrl";
import { openCanvas, setActiveCanvasChat } from "@/src/stores/chatSlice";

export function toAppletIdString(value) {
    if (!value) return null;
    if (typeof value === "object" && value._id) return String(value._id);
    return String(value);
}

async function resolveAppletHtml(resolvedApplet) {
    if (resolvedApplet.filePath) {
        const response = await fetch(getTextProxyUrl(resolvedApplet.filePath));
        if (!response.ok) {
            throw new Error(`Failed to fetch applet: ${response.status}`);
        }
        return response.text();
    }
    if (resolvedApplet.html) {
        return resolvedApplet.html;
    }
    const versions = resolvedApplet.htmlVersions;
    if (Array.isArray(versions) && versions.length > 0) {
        return versions[versions.length - 1].content || "";
    }
    return "";
}

export async function openCanvasAppletInChat({
    appletId,
    fallbackApplet = null,
    addChat,
    dispatch,
    router,
    t = (key) => key,
}) {
    const id = toAppletIdString(appletId);
    if (!id) {
        throw new Error("Missing applet id");
    }

    let resolvedApplet = fallbackApplet || {};
    const appletRes = await fetch(`/api/canvas-applets/${id}`);
    if (appletRes.ok) {
        resolvedApplet = await appletRes.json();
    } else if (!resolvedApplet.filePath) {
        const error = new Error(`Failed to fetch applet: ${appletRes.status}`);
        error.status = appletRes.status;
        throw error;
    }

    const htmlContent = await resolveAppletHtml(resolvedApplet);
    if (!htmlContent) {
        const error = new Error("Applet has no HTML content");
        error.status = 404;
        throw error;
    }

    const title =
        resolvedApplet.name || fallbackApplet?.name || t("Untitled Applet");
    const chat = await addChat.mutateAsync({
        messages: [],
        title,
    });
    const chatId = toAppletIdString(chat?._id);
    if (!chatId) {
        throw new Error("Chat creation returned no id");
    }

    dispatch(setActiveCanvasChat(chatId));
    dispatch(
        openCanvas({
            type: "html",
            title,
            htmlContent,
            url: resolvedApplet.filePath || undefined,
            appletId: id,
            workspacePath: resolvedApplet.workspacePath || null,
            fileHash: resolvedApplet.fileHash || null,
            blobPath: resolvedApplet.fileBlobPath || null,
        }),
    );

    router.push(`/chat/${chatId}`);
    return chatId;
}
