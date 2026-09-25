/** @jest-environment node */
import { parse } from "parse5";
import { repairWidgetBackgroundCache } from "../repairWidgetBackgroundCache.js";
import { ensureAppletRuntimeHtml } from "../appletSdkUtils.js";
import { HOME_WIDGET_IMAGERY_RULES } from "../homeWidgetCraft.js";

import { legacy } from "./fixtures/legacyWidgetBackground.js";
const document = (script) =>
    `<html><head><title>Keep me</title></head><body><script>${script}</script></body></html>`;
const scriptOf = (html) => {
    const findScript = (node) => {
        if (
            node.tagName === "script" &&
            !node.attrs.some(({ name }) => name === "src")
        ) {
            return node.childNodes.map(({ value }) => value || "").join("");
        }
        for (const child of node.childNodes || []) {
            const script = findScript(child);
            if (script !== undefined) return script;
        }
    };
    return findScript(parse(html));
};

it("migrates the saved example to the owned image helper on every runtime load", async () => {
    const html = ensureAppletRuntimeHtml(document(legacy), { appletId: "abc" });
    const ensureImage = jest
        .fn()
        .mockResolvedValue({ url: "https://example.test/saved.png" });
    const sdk = {
        media: { ensureImage, createImage: jest.fn() },
        data: { get: jest.fn(), set: jest.fn() },
        tasks: { wait: jest.fn() },
    };
    for (let load = 0; load < 2; load += 1) {
        const result = await new Function(
            "ConciergeSDK",
            `return (${scriptOf(html)})`,
        )(sdk);
        expect(result).toBe("https://example.test/saved.png");
    }
    expect(ensureImage).toHaveBeenCalledWith({
        key: "atmosphereUrl",
        prompt: "A newsroom",
        aspectRatio: "16:9",
    });
    expect(sdk.media.createImage).not.toHaveBeenCalled();
    expect(sdk.data.get).not.toHaveBeenCalled();
    expect(html).toContain("<title>Keep me</title>");
    expect(repairWidgetBackgroundCache(html)).toBe(html);
});

it("supports the optional availability guards and braced save in existing widgets", () => {
    const script = legacy
        .replace(
            "if (!url)",
            "if (!url && window.ConciergeSDK?.media?.createImage && window.ConciergeSDK?.tasks?.wait)",
        )
        .replace(
            'if (url) await ConciergeSDK.data.set("atmosphereUrl", { url });',
            'if (url) { await ConciergeSDK.data.set("atmosphereUrl", { url }); }',
        );
    expect(repairWidgetBackgroundCache(document(script))).toContain(
        "media.ensureImage",
    );
});

it.each([
    ["shared data", legacy.replace("data.get", "sharedData.get")],
    ["another fallback", legacy.replace(": null;", ": fallbackUrl;")],
    [
        "custom side effects",
        legacy.replace("const started =", "trackGeneration(); const started ="),
    ],
    [
        "different saved key",
        legacy.replace('data.set("atmosphereUrl"', 'data.set("anotherKey"'),
    ],
    [
        "cache still used",
        legacy.replace("return url;", "console.log(cached); return url;"),
    ],
    [
        "dynamic generation options",
        legacy.replace('prompt: "A newsroom"', "prompt: getPrompt()"),
    ],
    ["invalid JavaScript", legacy + " syntax error @"],
    ["source in a string", `const example = ${JSON.stringify(legacy)};`],
    ["source in a comment", `/* ${legacy} */`],
])("leaves %s untouched", (_, script) => {
    const html = document(script);
    expect(repairWidgetBackgroundCache(html)).toBe(html);
});

it.each(['type="application/json"', 'src="/external.js"'])(
    "does not modify non-executed inline content: %s",
    (attribute) => {
        const html = `<script ${attribute}>${legacy}</script>`;
        expect(repairWidgetBackgroundCache(html)).toBe(html);
    },
);

it("teaches the helper instead of a handwritten generation loop", () => {
    expect(HOME_WIDGET_IMAGERY_RULES).toContain("media.ensureImage({");
    expect(HOME_WIDGET_IMAGERY_RULES).not.toContain("cached?.found");
    expect(HOME_WIDGET_IMAGERY_RULES).not.toContain("const started =");
});
