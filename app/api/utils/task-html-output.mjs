import { parse } from "parse5";
import { checkMediaFile } from "./media-service-utils.js";

export const MAX_TASK_OUTPUT_BYTES = 2 * 1024 * 1024;
export const TASK_HTML_OUTPUT_ERROR = "TASK_HTML_OUTPUT_INVALID";

// The server chooses this directory. Never resolve paths supplied by the model.
export function taskOutputDirectory(root, attemptId) {
    if (
        !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(root || "") ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(attemptId || "")
    ) {
        return null;
    }
    return `${root}/draft-${attemptId}`;
}

export function taskOutputFileInstructions(directory) {
    if (!directory) return "";
    const workspacePath = `/workspace/files/${directory}`;
    return `File output is supported for this run. Its output directory is:
${workspacePath}
Create that directory and write either:
- result.json containing the complete summary, html, and widgetHtml fields; or
- index.html containing the complete report, plus widget.html for the Home widget.
Use the cloud-backed path above, close the files after writing, and finish with a short summary. The runner reads these exact files and publishes them; you do not need to repeat file contents in your final response.
This is the output destination for the current attempt. It supersedes destinations in earlier instructions or handoffs. If continuing saved work, finish and copy the completed result here.
Files saved elsewhere, including scratch/output.json, are working files and are not published automatically. Never substitute a filename, link, ellipsis, or description of omitted content for an inline HTML document.`;
}

function outputError(
    message = "No usable HTML report was returned or saved in this run's output directory. The previous report was kept.",
) {
    return Object.assign(new Error(message), { code: TASK_HTML_OUTPUT_ERROR });
}

const hiddenTags = new Set(["head", "script", "style", "template", "noscript"]);

// Accept useful fragments as before, but not an empty document, a path, or a
// doctype followed by prose claiming that the real document exists elsewhere.
export function usableTaskHtml(value, sanitize) {
    if (
        typeof value !== "string" ||
        !value.trim() ||
        Buffer.byteLength(value) > MAX_TASK_OUTPUT_BYTES
    )
        return "";
    if (!/<[a-z][\w:-]*(?:\s[^>]*)?>/i.test(value)) return "";
    if (/<html[\s>]/i.test(value) && !/<\/html\s*>/i.test(value)) return "";
    if (/<body[\s>]/i.test(value) && !/<\/body\s*>/i.test(value)) return "";
    const html = sanitize(value);
    if (Buffer.byteLength(html) > MAX_TASK_OUTPUT_BYTES) return "";
    const stack = [parse(html)];
    const text = [];
    let hasMedia = false;
    while (stack.length) {
        const node = stack.pop();
        if (hiddenTags.has(node.tagName)) continue;
        if (node.nodeName === "#text") text.push(node.value);
        if (
            node.tagName === "img" &&
            node.attrs?.some((a) => a.name === "src" && a.value.trim())
        )
            hasMedia = true;
        for (
            let index = (node.childNodes?.length || 0) - 1;
            index >= 0;
            index--
        ) {
            stack.push(node.childNodes[index]);
        }
    }
    const visible = text.join(" ").replace(/\s+/g, " ").trim();
    if (!hasMedia && !/[\p{L}\p{N}]/u.test(visible)) return "";
    if (
        visible.length < 600 &&
        (/\b(?:full|complete|entire|bilingual)\b.{0,100}\b(?:document|report|brief|html)\b.{0,100}\b(?:written|saved|stored|see|omitted|available)\b/i.test(
            visible,
        ) ||
            /^(?:[.\u2026\s()[\]]*)(?:see|open|read|download)\s+.{0,200}\.(?:html?|json)(?:[.\u2026\s()[\]]*)$/i.test(
                visible,
            ) ||
            /^(?:[.\u2026\s()[\]]*)(?:html|content|report|document)\s+(?:omitted|goes here|here)(?:[.\u2026\s()[\]]*)$/i.test(
                visible,
            ))
    )
        return "";
    return html;
}

// Reads are limited to exact server-selected paths in the owner's storage.
// Enforce the size on the stream as Content-Length is not always present.
export async function readTaskOutputFile(blobPath, storageTarget, user) {
    const signal = AbortSignal.timeout(15000);
    const file = await checkMediaFile({
        blobPath,
        storageTarget,
        signal,
        storageAuthorization: {
            user,
            routing: {
                contextId: user.contextId,
                userId: user.contextId,
                fileScope: "automations",
            },
            targets: [
                { owner: user.contextId, path: blobPath, actions: ["read"] },
            ],
        },
    });
    if (!file?.url) return null;
    const response = await fetch(file.shortLivedUrl || file.url, {
        cache: "no-store",
        redirect: "error",
        signal,
    });
    if (response.status === 404) {
        await response.body?.cancel();
        return null;
    }
    if (!response.ok) {
        await response.body?.cancel();
        throw outputError(
            "The saved report could not be read. The previous report was kept.",
        );
    }
    if (
        Number(response.headers.get("content-length")) > MAX_TASK_OUTPUT_BYTES
    ) {
        await response.body?.cancel();
        throw outputError(
            "The saved report exceeds the 2 MiB output limit. The previous report was kept.",
        );
    }
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_TASK_OUTPUT_BYTES)
                throw outputError(
                    "The saved report exceeds the 2 MiB output limit. The previous report was kept.",
                );
            chunks.push(Buffer.from(value));
        }
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
}

export async function resolveTaskHtmlOutput({
    parsed,
    directory,
    readFile,
    sanitize,
}) {
    const normalize = (candidate, source) => {
        const html = usableTaskHtml(candidate?.html, sanitize);
        if (!html) return null;
        const widgetHtml = usableTaskHtml(candidate.widgetHtml, sanitize);
        return {
            summary:
                typeof candidate.summary === "string" ? candidate.summary : "",
            html,
            widgetHtml,
            publishing: {
                source,
                widgetOmitted: Boolean(candidate.widgetHtml && !widgetHtml),
            },
        };
    };
    const inline = normalize(parsed, "inline");
    if (inline) return inline;
    if (!directory) throw outputError();
    const read = async (name) => {
        try {
            return await readFile(`${directory}/${name}`);
        } catch (error) {
            if (error.code === TASK_HTML_OUTPUT_ERROR) throw error;
            throw outputError(
                "The saved report could not be read. The previous report was kept.",
            );
        }
    };
    const json = await read("result.json");
    if (json) {
        let candidate;
        try {
            candidate = JSON.parse(json);
        } catch {
            /* Try the HTML files. */
        }
        const result = normalize(candidate, `${directory}/result.json`);
        if (result) return result;
    }
    const html = await read("index.html");
    if (usableTaskHtml(html, sanitize)) {
        const widgetHtml = await read("widget.html");
        return normalize(
            { summary: parsed?.summary, html, widgetHtml },
            `${directory}/index.html`,
        );
    }
    throw outputError();
}
