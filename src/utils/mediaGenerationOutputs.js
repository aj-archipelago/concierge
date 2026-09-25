// Only inspect generated output, never prediction inputs (which contain references).
export function getMediaGenerationOutputs(data, info = {}) {
    let parsed = data;
    if (typeof data === "string" && /^\s*[[{]/.test(data)) {
        try {
            parsed = JSON.parse(data);
        } catch {
            /* direct URL fallback */
        }
    }
    const output =
        parsed?.result && Object.hasOwn(parsed.result, "output")
            ? parsed.result.output
            : parsed &&
                typeof parsed === "object" &&
                Object.hasOwn(parsed, "output")
              ? parsed.output
              : parsed;
    const outputs = [];
    const seen = new Set();
    const isUrl = (value) =>
        typeof value === "string" &&
        /^(https?:\/\/|gs:\/\/|data:(image|video|audio)\/)/i.test(value);
    const add = (url, details = {}) => {
        if (!isUrl(url) || seen.has(url)) return;
        seen.add(url);
        outputs.push({ ...details, url });
    };
    const visit = (value, key = "") => {
        if (typeof value === "string") return add(value, key ? { key } : {});
        if (Array.isArray(value))
            return value.forEach((item, i) =>
                visit(item, `${key ? key + "." : ""}${i}`),
            );
        if (!value || typeof value !== "object") return;
        const url = value.url || value.uri || value.image;
        const details = {};
        for (const field of [
            "name",
            "description",
            "bounding_box",
            "bbox",
            "order",
            "z_index",
            "mimeType",
            "type",
        ]) {
            if (value[field] !== undefined) details[field] = value[field];
        }
        if (isUrl(url)) add(url, { key, ...details });
        for (const [field, item] of Object.entries(value)) {
            if (
                ![
                    "input",
                    "style_id",
                    "name",
                    "description",
                    "url",
                    "uri",
                    "image",
                ].includes(field)
            ) {
                visit(item, `${key ? key + "." : ""}${field}`);
            }
        }
    };
    visit(output);
    if (!outputs.length) {
        for (const artifact of info?.artifacts || [])
            add(artifact.url, artifact);
    }
    const styleId = output?.style_id;
    const providerMetadata = {
        ...(typeof styleId === "string" && { styleId }),
        ...(typeof parsed?.lyrics === "string" &&
            parsed.lyrics && { lyrics: parsed.lyrics }),
    };
    return {
        outputs,
        providerMetadata: Object.keys(providerMetadata).length
            ? providerMetadata
            : undefined,
    };
}
