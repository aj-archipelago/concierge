import { uploadFileToMediaHelper } from "./fileUploadUtils";
import { createAppletGlobalStorageTarget } from "./storageTargets";
import { injectAppletIdMeta } from "./appletHtmlUtils";

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
 * @param {{ url: string, hash?: string, displayFilename?: string, name?: string }} params.initialUploadResult
 * @returns {Promise<{ appletId: string|null, html: string, effectiveUpload: typeof initialUploadResult }>}
 */
export async function registerCanvasAppletAfterUpload({
    taggedHtml,
    filename,
    appletName,
    contextId,
    initialUploadResult,
}) {
    let appletId = null;
    let html = taggedHtml;
    let effectiveUpload = initialUploadResult;

    try {
        const appletRes = await fetch("/api/canvas-applets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: appletName || filename.replace(/\.html$/i, ""),
                filePath: initialUploadResult.url,
                html: taggedHtml,
            }),
        });
        if (!appletRes.ok) {
            return { appletId: null, html: taggedHtml, effectiveUpload };
        }

        const appletData = await appletRes.json();
        appletId = appletData._id;

        html = injectAppletIdMeta(taggedHtml, appletId);

        const updatedBlob = new Blob([html], { type: "text/html" });
        const updatedFile = new File([updatedBlob], filename, {
            type: "text/html",
        });
        const secondUpload = await uploadFileToMediaHelper(updatedFile, {
            storageTarget: createAppletGlobalStorageTarget(contextId),
            checkHash: false,
        });
        if (secondUpload?.hash && secondUpload?.url) {
            effectiveUpload = secondUpload;
        }

        await fetch(`/api/canvas-applets/${appletId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                html,
                ...(effectiveUpload?.url
                    ? { filePath: effectiveUpload.url }
                    : {}),
            }),
        });
    } catch (err) {
        console.error("Error creating canvas applet record:", err);
    }

    return { appletId, html, effectiveUpload };
}
