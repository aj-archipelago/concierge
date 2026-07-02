const IMAGE_POLL_INTERVAL_MS = 1000;
const IMAGE_POLL_ATTEMPTS = 90;
const MEDIA_URL_RETRY_ATTEMPTS = 8;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

function omitUndefined(value) {
    return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== undefined),
    );
}

function getMediaUrl(value) {
    return value?.azureUrl || value?.url || value?.gcsUrl || "";
}

function getVariantTaskId(started, variant) {
    return started?.variants?.[variant]?.taskId || null;
}

function getVariantJobId(started, variant) {
    return started?.variants?.[variant]?.jobId || null;
}

function logBackgroundLightImageError(error) {
    console.warn(
        "Background light applet image generation failed:",
        error?.message || error,
    );
}

function generatedImageAlt(metadata = {}) {
    const name = metadata.name || metadata.appName || "Untitled Applet";
    return `Generated applet image for ${name}`;
}

export function appletMetadataPayload(metadata = {}) {
    return omitUndefined({
        name: metadata.name,
        slug: metadata.slug,
        description: metadata.description,
        badgeLabel: metadata.badgeLabel,
        icon: metadata.icon,
        imageUrl: metadata.imageUrl,
        imageLightUrl: metadata.imageLightUrl,
        imageDarkUrl: metadata.imageDarkUrl,
        imageAlt: metadata.imageAlt,
        tags: Array.isArray(metadata.tags) ? metadata.tags : undefined,
        category: metadata.category,
        metadataGeneratedAt:
            metadata.metadataGeneratedAt || new Date().toISOString(),
    });
}

export async function generateAppletMetadata(appletId) {
    const response = await fetch(
        `/api/canvas-applets/${encodeURIComponent(appletId)}/metadata/generate`,
        { method: "POST" },
    );
    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }
    return response.json();
}

export async function updateAppletCardMetadata(appletId, metadata) {
    const payload = appletMetadataPayload(metadata);
    const response = await fetch(
        `/api/canvas-applets/${encodeURIComponent(appletId)}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appMetadata: payload }),
        },
    );
    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }
    return response.json();
}

export async function generateAndApplyAppletMetadata(appletId) {
    const generated = await generateAppletMetadata(appletId);
    const metadata = generated?.metadata || {};
    const applet = await updateAppletCardMetadata(appletId, metadata);
    return {
        ...generated,
        metadata: appletMetadataPayload(metadata),
        applet,
    };
}

export async function startAppletImageGeneration({
    appletId,
    metadata,
    prompt,
    styleCues,
    settings,
    quality,
    aspectRatio,
    variant,
    referenceImageUrl,
    cleanupExisting,
}) {
    const body = omitUndefined({
        metadata,
        prompt,
        styleCues,
        settings,
        quality,
        aspectRatio,
        variant,
        referenceImageUrl,
        cleanupExisting,
    });
    const response = await fetch(
        `/api/canvas-applets/${encodeURIComponent(appletId)}/image/generate`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }
    return response.json();
}

export async function pollAppletImageUrl(
    taskId,
    { attempts = IMAGE_POLL_ATTEMPTS } = {},
) {
    let completedWithoutUrlAttempts = 0;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        await delay(IMAGE_POLL_INTERVAL_MS);
        const taskResponse = await fetch(
            `/api/tasks/${encodeURIComponent(taskId)}`,
        );
        if (!taskResponse.ok) {
            throw new Error(await readResponseError(taskResponse));
        }

        const task = await taskResponse.json();
        const taskUrl = getMediaUrl(task?.data);
        if (taskUrl) return taskUrl;

        if (task.status === "failed") {
            const taskError =
                task.error?.message || task.error || "Unknown error";
            throw new Error(`Image generation failed: ${String(taskError)}`);
        }

        if (task.status === "completed") {
            const mediaResponse = await fetch(
                "/api/media-items?page=1&limit=100",
            );
            if (!mediaResponse.ok) {
                throw new Error(await readResponseError(mediaResponse));
            }
            const mediaData = await mediaResponse.json();
            const mediaItem = mediaData?.mediaItems?.find(
                (item) => item.taskId === taskId,
            );
            const mediaUrl = getMediaUrl(mediaItem);
            if (mediaUrl) return mediaUrl;

            completedWithoutUrlAttempts += 1;
            if (completedWithoutUrlAttempts >= MEDIA_URL_RETRY_ATTEMPTS) break;
        }
    }

    throw new Error(
        "Image generation completed but the image URL could not be retrieved. The image may still be available on the Media page.",
    );
}

export async function generateAndApplyAppletImage({
    appletId,
    metadata = {},
    prompt,
    styleCues,
    settings,
    quality,
    aspectRatio,
    waitForResult = true,
    updateMetadata = true,
    onLightMetadataUpdated,
}) {
    const darkStarted = await startAppletImageGeneration({
        appletId,
        metadata,
        prompt,
        styleCues,
        settings,
        quality,
        aspectRatio,
        variant: "dark",
        cleanupExisting: true,
    });

    if (!waitForResult) {
        return {
            ...darkStarted,
            imageUrl: null,
            imageLightUrl: null,
            imageDarkUrl: null,
            metadataUpdated: false,
        };
    }

    const darkTaskId =
        getVariantTaskId(darkStarted, "dark") || darkStarted.taskId;
    if (!darkTaskId) {
        throw new Error("Applet image generation did not return a task ID.");
    }

    const imageDarkUrl = await pollAppletImageUrl(darkTaskId);
    const imageUrl = imageDarkUrl;
    let applet = null;
    const imageAlt = metadata.imageAlt || generatedImageAlt(metadata);
    if (updateMetadata) {
        applet = await updateAppletCardMetadata(appletId, {
            imageUrl,
            imageLightUrl: "",
            imageDarkUrl,
            imageAlt,
            metadataGeneratedAt: new Date().toISOString(),
        });
    }

    let lightStarted = null;
    let lightTaskId = null;
    let lightError = null;
    try {
        lightStarted = await startAppletImageGeneration({
            appletId,
            metadata,
            prompt,
            styleCues,
            settings,
            quality,
            aspectRatio,
            variant: "light",
            referenceImageUrl: imageDarkUrl,
            cleanupExisting: false,
        });
        lightTaskId =
            getVariantTaskId(lightStarted, "light") || lightStarted.taskId;
        if (lightTaskId && updateMetadata) {
            const lightCompletion = pollAppletImageUrl(lightTaskId).then(
                async (imageLightUrl) => {
                    if (!imageLightUrl) return null;
                    const lightApplet = await updateAppletCardMetadata(
                        appletId,
                        {
                            imageUrl,
                            imageLightUrl,
                            imageDarkUrl,
                            imageAlt,
                            metadataGeneratedAt: new Date().toISOString(),
                        },
                    );
                    await onLightMetadataUpdated?.(lightApplet);
                    return lightApplet;
                },
            );
            void lightCompletion.catch(logBackgroundLightImageError);
        }
    } catch (error) {
        lightError = error?.message || String(error);
        logBackgroundLightImageError(error);
    }

    return {
        ...darkStarted,
        taskId: darkTaskId,
        jobId: getVariantJobId(darkStarted, "dark") || darkStarted.jobId,
        lightTaskId,
        lightJobId:
            getVariantJobId(lightStarted, "light") || lightStarted?.jobId,
        variants: {
            ...(darkStarted.variants || {}),
            ...(lightStarted?.variants || {}),
        },
        imageUrl,
        imageLightUrl: null,
        imageDarkUrl,
        lightPending: !!lightTaskId,
        lightError,
        metadataUpdated: !!applet,
        applet,
    };
}

export function kickoffAppletAssetGeneration({ appletId, metadata = {} }) {
    if (!appletId) return null;

    const metadataPromise = generateAndApplyAppletMetadata(appletId);
    const imagePromise = generateAndApplyAppletImage({
        appletId,
        metadata,
        waitForResult: true,
        updateMetadata: true,
    });

    const completion = Promise.allSettled([metadataPromise, imagePromise]).then(
        (results) => {
            results.forEach((result, index) => {
                if (result.status === "rejected") {
                    const label = index === 0 ? "metadata" : "image";
                    console.warn(
                        `Automatic applet ${label} generation failed:`,
                        result.reason?.message || result.reason,
                    );
                }
            });
            return results;
        },
    );

    void completion.catch(() => {});
    return completion;
}
