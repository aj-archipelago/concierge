/** @jest-environment node */
import {
    MAX_TASK_OUTPUT_BYTES,
    TASK_HTML_OUTPUT_ERROR,
    taskOutputDirectory,
    taskOutputFileInstructions,
    usableTaskHtml,
    resolveTaskHtmlOutput,
    readTaskOutputFile,
} from "../task-html-output.mjs";
import { sanitizeGeneratedHtml } from "../../automations/utils.js";
import { checkMediaFile } from "../media-service-utils.js";

jest.mock("../media-service-utils.js", () => ({ checkMediaFile: jest.fn() }));
jest.mock("../../models/automation.js", () => ({
    __esModule: true,
    default: {},
}));
jest.mock("../../models/user.mjs", () => ({ __esModule: true, default: {} }));
jest.mock("../shareAccess.js", () => ({}));

const attempt = "12345678-1234-1234-1234-123456789abc";
const directory = taskOutputDirectory("automations/brief/outputs/run", attempt);
const report =
    "<!doctype html><html><body><h1>Morning brief</h1><p>إحاطة اليوم</p></body></html>";
const widget = "<p>Today's brief is ready.</p>";
const resolve = (parsed, files = {}, path = directory) => {
    const readFile = jest.fn(async (name) => files[name] || null);
    return {
        readFile,
        result: resolveTaskHtmlOutput({
            parsed,
            directory: path,
            readFile,
            sanitize: sanitizeGeneratedHtml,
        }),
    };
};

test.each([
    "<!doctype html>… (full bilingual EN/AR document, 27,132 chars, written to output.json)",
    "<!doctype html> ... (complete bilingual EN/AR document written to output_new.json)",
    "<!doctype html>... complete bilingual brief (see /workspace/out/index.html) ...",
    "<html><body>… (full bilingual EN/AR document written to scratch/output.json)</body></html>",
    "<p>See scratch/output.json</p>",
    "<html><head><title>A report</title><style>body{color:red}</style></head><body>...</body></html>",
    "<script>document.write('report')</script>",
    "<p><!-- no output --></p>",
    "<!doctype html><html><body><h1>Report</h1><p>Truncated",
    "result.json",
    "",
])("rejects missing or placeholder HTML: %s", (html) => {
    expect(usableTaskHtml(html, sanitizeGeneratedHtml)).toBe("");
});

test.each([
    report,
    "<p>No changes today.</p>",
    '<img src="https://example.com/chart.png">',
    "<body>تقرير اليوم</body>",
])("accepts useful HTML without a minimum length", (html) => {
    expect(usableTaskHtml(html, sanitizeGeneratedHtml)).not.toBe("");
});

test("valid inline output avoids storage reads and is sanitized", async () => {
    const { result, readFile } = resolve({
        html: report.replace("</body>", "<script>alert(1)</script></body>"),
        widgetHtml: widget,
    });
    const saved = await result;
    expect(saved.html).toContain("Morning brief");
    expect(saved.html).not.toContain("script");
    expect(saved.publishing.source).toBe("inline");
    expect(readFile).not.toHaveBeenCalled();
});

test("recovers the complete report and widget from this attempt's result.json", async () => {
    const { result, readFile } = resolve(
        { html: "<!doctype html>... (full document written to output.json)" },
        {
            [`${directory}/result.json`]: JSON.stringify({
                summary: "Ready",
                html: report,
                widgetHtml: widget,
            }),
        },
    );
    const saved = await result;
    expect(saved).toMatchObject({
        summary: "Ready",
        publishing: { source: `${directory}/result.json` },
    });
    expect(saved.html).toContain("إحاطة اليوم");
    expect(saved.widgetHtml).toContain("Today's brief");
    expect(readFile.mock.calls).toEqual([[`${directory}/result.json`]]);
});

test("file-only completion can use HTML files when JSON is absent or malformed", async () => {
    const { result, readFile } = resolve(
        {},
        {
            [`${directory}/result.json`]: "{unfinished",
            [`${directory}/index.html`]: report,
            [`${directory}/widget.html`]: widget,
        },
    );
    expect((await result).publishing.source).toBe(`${directory}/index.html`);
    expect(readFile.mock.calls).toEqual(
        ["result.json", "index.html", "widget.html"].map((name) => [
            `${directory}/${name}`,
        ]),
    );
});

test("does not follow a model path or recover a prior run or retry", async () => {
    const { result, readFile } = resolve(
        { html: "...", outputFile: "https://example.com/report.html" },
        {
            "automations/brief/scratch/output.json": JSON.stringify({
                html: report,
            }),
            "automations/brief/outputs/old/index.html": report,
            "automations/brief/outputs/run/draft-old/index.html": report,
        },
    );
    await expect(result).rejects.toMatchObject({
        code: TASK_HTML_OUTPUT_ERROR,
    });
    expect(readFile.mock.calls).toEqual([
        [`${directory}/result.json`],
        [`${directory}/index.html`],
    ]);
});

test("legacy in-flight runs without a server-issued attempt cannot use file fallback", async () => {
    const { result, readFile } = resolve({ html: "..." }, {}, null);
    await expect(result).rejects.toMatchObject({
        code: TASK_HTML_OUTPUT_ERROR,
    });
    expect(readFile).not.toHaveBeenCalled();
});

test("an invalid widget cannot replace a usable full report with a placeholder", async () => {
    const saved = await resolve({
        html: report,
        widgetHtml: "<!doctype html>...",
    }).result;
    expect(saved.html).toContain("Morning brief");
    expect(saved.widgetHtml).toBe("");
    expect(saved.publishing.widgetOmitted).toBe(true);
});

test("rejects excessive inline output", () => {
    expect(
        usableTaskHtml(
            `<p>${"x".repeat(MAX_TASK_OUTPUT_BYTES)}</p>`,
            sanitizeGeneratedHtml,
        ),
    ).toBe("");
});

test("destination construction rejects traversal and missing attempt identities", () => {
    expect(taskOutputDirectory("automations/a/../b", attempt)).toBeNull();
    expect(
        taskOutputDirectory("automations/a/outputs/task", "../old"),
    ).toBeNull();
    expect(taskOutputDirectory("automations/a/outputs/task")).toBeNull();
    const instructions = taskOutputFileInstructions(directory);
    expect(instructions).toContain(`/workspace/files/${directory}`);
    expect(instructions).toContain("close the files");
    expect(instructions).toContain("supersedes");
});

describe("bounded artifact reads", () => {
    const originalFetch = global.fetch;
    const user = { _id: "owner", contextId: "context" };
    const target = { kind: "automation", userContextId: "context" };
    beforeEach(() => {
        jest.clearAllMocks();
        checkMediaFile.mockResolvedValue({ url: "https://example.com/blob" });
        global.fetch = jest.fn();
    });
    afterEach(() => {
        global.fetch = originalFetch;
    });
    test("uses an exact-path read grant and disables redirects and caching", async () => {
        global.fetch.mockResolvedValue(new Response(report));
        expect(
            await readTaskOutputFile(`${directory}/index.html`, target, user),
        ).toBe(report);
        expect(checkMediaFile).toHaveBeenCalledWith(
            expect.objectContaining({
                blobPath: `${directory}/index.html`,
                storageTarget: target,
                storageAuthorization: expect.objectContaining({
                    user,
                    targets: [
                        {
                            owner: "context",
                            path: `${directory}/index.html`,
                            actions: ["read"],
                        },
                    ],
                }),
            }),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            "https://example.com/blob",
            expect.objectContaining({
                redirect: "error",
                cache: "no-store",
                signal: expect.any(AbortSignal),
            }),
        );
    });
    test("a missing exact path does not fall back to a hash or URL from the agent", async () => {
        checkMediaFile.mockResolvedValue(null);
        expect(
            await readTaskOutputFile(`${directory}/index.html`, target, user),
        ).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });
    test("rejects a declared oversized file before consuming it", async () => {
        global.fetch.mockResolvedValue(
            new Response("small", {
                headers: {
                    "content-length": String(MAX_TASK_OUTPUT_BYTES + 1),
                },
            }),
        );
        await expect(
            readTaskOutputFile(`${directory}/index.html`, target, user),
        ).rejects.toMatchObject({ code: TASK_HTML_OUTPUT_ERROR });
    });
    test("enforces the byte bound even without Content-Length", async () => {
        global.fetch.mockResolvedValue(
            new Response("x".repeat(MAX_TASK_OUTPUT_BYTES + 1)),
        );
        await expect(
            readTaskOutputFile(`${directory}/index.html`, target, user),
        ).rejects.toMatchObject({ code: TASK_HTML_OUTPUT_ERROR });
    });
});
