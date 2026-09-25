import { createHash } from "node:crypto";

export function widgetSourceVersion(applet) {
    return createHash("sha256")
        .update(
            JSON.stringify({
                updatedAt: applet.updatedAt,
                published: applet.publishedContentHash,
                publishedVersion: applet.publishedVersionIndex,
                versions: applet.htmlVersions?.length,
                filePath: applet.filePath,
            }),
        )
        .digest("hex");
}

// The request owns generation and saving, not the browser. Redis retains completed
// HTML for 24 hours so a save retry on another instance never calls the model again.
export async function ensureAppletWidget({
    applet,
    coordinator,
    generate,
    save,
    retry = false,
    generationVersion = "",
}) {
    const id = String(applet._id);
    const state = await coordinator.claim(
        id,
        `${widgetSourceVersion(applet)}:${generationVersion}`,
        retry,
    );
    if (state.status === "running" || state.status === "queued")
        return { status: state.status };
    if (state.status === "failed")
        return {
            status: "failed",
            code: state.code || "WIDGET_GENERATION_FAILED",
        };
    let html = state.html;
    let checkpointed = state.status === "ready";
    if (state.status === "claimed") {
        try {
            html = await generate();
        } catch (error) {
            const code =
                error?.code === "WIDGET_QUALITY_FAILED"
                    ? error.code
                    : "WIDGET_GENERATION_FAILED";
            await coordinator
                .finish(id, state.token, "failed", code)
                .catch(() => {});
            return { status: "failed", code };
        }
        try {
            await coordinator.finish(id, state.token, "ready", html);
            checkpointed = true;
        } catch {
            // Still attempt the primary save if Redis failed after generation.
            // An unreleased lease expires; do not start uncoordinated generation.
            console.warn("Could not checkpoint generated Home widget");
        }
    }
    if (!html) throw new Error("Widget generation returned no HTML");
    try {
        return { status: "ready", html: await save(html) };
    } catch (error) {
        return {
            status: "failed",
            code:
                error.code === "WIDGET_SOURCE_CHANGED"
                    ? error.code
                    : checkpointed
                      ? "WIDGET_SAVE_FAILED"
                      : "WIDGET_INTERRUPTED",
        };
    }
}
