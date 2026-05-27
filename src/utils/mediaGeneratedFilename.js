export function getGeneratedMediaTaskSuffix(taskId) {
    return String(taskId || "")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(-12);
}

export function getGeneratedMediaFilenameStem(
    prompt,
    { index = 0, uniqueSuffix = "" } = {},
) {
    const suffix = index > 0 ? `-${index}` : "";
    const normalizedUniqueSuffix = uniqueSuffix
        ? `-${String(uniqueSuffix)
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "")
              .slice(-12)}`
        : "";

    if (!prompt || typeof prompt !== "string") {
        return `media${suffix}${normalizedUniqueSuffix}`;
    }

    let name = prompt
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    if (name.length > 60) {
        name = name.substring(0, 60);
        const lastHyphen = name.lastIndexOf("-");
        if (lastHyphen > 20) name = name.substring(0, lastHyphen);
    }

    return `${name || "media"}${suffix}${normalizedUniqueSuffix}`;
}

export function getGeneratedMediaFilename(prompt, extension, options = {}) {
    const ext = extension || "bin";
    return `${getGeneratedMediaFilenameStem(prompt, options)}.${ext}`;
}

export function getExpectedGeneratedMediaFilenameStem(mediaItem) {
    const taskSuffix = getGeneratedMediaTaskSuffix(
        mediaItem?.taskId || mediaItem?.cortexRequestId,
    );
    if (!taskSuffix) return "";

    return getGeneratedMediaFilenameStem(
        mediaItem?.displayPrompt || mediaItem?.prompt,
        { uniqueSuffix: taskSuffix },
    );
}
