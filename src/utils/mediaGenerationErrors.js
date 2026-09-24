export function describeMediaGenerationError(media, t) {
    const error = media?.error || media?.result?.error;
    const details =
        typeof error === "string"
            ? error
            : error?.message || error?.error || media?.statusText || "";
    const seedance = /seedance/i.test(`${media?.model || ""} ${details}`);
    const moderation =
        /flagged as sensitive|content (?:policy|moderation)|safety filter/i.test(
            details,
        ) ||
        (seedance && /\bE005\b/.test(details));
    if (moderation) {
        return {
            kind: "moderation",
            title: t(
                seedance
                    ? "Seedance declined this request"
                    : "The provider declined this request",
            ),
            message: t(
                seedance
                    ? "Seedance's content filter rejected the input or generated output. It can also reject ordinary scenes. Review your prompt and references, or choose another video model."
                    : "The provider's content filter rejected the input or generated output. Review your prompt and references, or choose another model.",
            ),
            details,
        };
    }
    if (
        media?.type === "video" &&
        /timed out|overall deadline/i.test(details)
    ) {
        return {
            kind: "timeout",
            title: t("Video generation took too long"),
            message: t(
                "We did not receive a completed video in time. Try again, use a shorter clip, or choose another video model.",
            ),
            details,
        };
    }
    return {
        kind: "error",
        title: t("Media generation failed"),
        message: details || t("Unknown error occurred"),
        details,
    };
}
