import { uploadFileToMediaHelper } from "./fileUploadUtils";
import { createAppletGlobalStorageTarget } from "./storageTargets";
import { injectAppletIdMeta } from "./appletHtmlUtils";

async function registrationError(response, stage) {
    const body = await response.json().catch(() => null);
    const error = new Error(
        body?.error || body?.message || `${stage} failed (${response.status})`,
    );
    error.status = response.status;
    return error;
}

/**
 * After applet HTML is uploaded to blob storage, create the canvas applet Mongo
 * document, inject <meta name="applet-id">, re-upload the file, and PUT the
 * record so preview/publish flows can resolve the applet.
 *
 * @param {object} params
 * @param {string} params.taggedHtml - HTML including concierge-type meta (no applet-id yet)
 * @param {string} params.filename - Original filename used for the File blob
 * @param {string} params.appletName - Display name for the Applet document
 * @param {string} params.contextId - User context id for storage target
 * @param {string|null} params.agentContext - "create" or a canonical shared context
 * @param {{ url: string, hash?: string, displayFilename?: string, name?: string }} params.initialUploadResult
 * @returns {Promise<{ appletId: string|null, agentContext: string|null, html: string, effectiveUpload: typeof initialUploadResult }>}
 */
export async function registerCanvasAppletAfterUpload({
    taggedHtml,
    filename,
    appletName,
    contextId,
    initialUploadResult,
    agentContext = null,
}) {
    let appletId = null;
    let resolvedAgentContext = null;
    let html = taggedHtml;
    let effectiveUpload = initialUploadResult;

    try {
        const appletRes = await fetch("/api/canvas-applets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: appletName || filename.replace(/\.html$/i, ""),
                filePath: initialUploadResult.url,
                ...(agentContext ? { agentContext } : {}),
            }),
        });
        if (!appletRes.ok) {
            throw await registrationError(appletRes, "Applet registration");
        }

        const appletData = await appletRes.json();
        appletId = appletData._id;
        if (!appletId) throw new Error("Applet registration returned no ID");
        resolvedAgentContext = appletData.agentContext || null;

        html = injectAppletIdMeta(taggedHtml, appletId);

        const updatedBlob = new Blob([html], { type: "text/html" });
        const updatedFile = new File([updatedBlob], filename, {
            type: "text/html",
        });
        const secondUpload = await uploadFileToMediaHelper(updatedFile, {
            storageTarget: createAppletGlobalStorageTarget(contextId),
            checkHash: false,
        });
        if (secondUpload?.url) {
            effectiveUpload = secondUpload;
        }

        const updateRes = await fetch(`/api/canvas-applets/${appletId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                html,
                saveVersion: true,
                ...(effectiveUpload?.url
                    ? { filePath: effectiveUpload.url }
                    : {}),
            }),
        });
        if (!updateRes.ok) {
            throw await registrationError(updateRes, "Applet version save");
        }
    } catch (err) {
        err.appletId = appletId;
        err.effectiveUpload = effectiveUpload;
        err.agentContext = resolvedAgentContext;
        console.error("Error creating canvas applet record:", err);
        throw err;
    }

    return {
        appletId,
        agentContext: resolvedAgentContext,
        html,
        effectiveUpload,
    };
}
