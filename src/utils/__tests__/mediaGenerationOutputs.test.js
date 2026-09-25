import { getMediaGenerationOutputs } from "../mediaGenerationOutputs";
import fs from "fs";
import path from "path";
import vm from "node:vm";

test("worker stores every output and returns reusable provider metadata", async () => {
    const source = fs.readFileSync(
        path.join(__dirname, "../../../jobs/tasks/media-generation.mjs"),
        "utf8",
    );
    const method = source.match(
        /async processMediaData\([\s\S]*?(?=\n {4}async processSingleMediaData)/,
    )[0];
    const worker = vm.runInNewContext(`({${method}})`, {
        getMediaGenerationOutputs,
    });
    worker.processSingleMediaData = jest.fn(async (url) => ({
        url: url.replace("example.com", "stored.example.com"),
    }));
    const result = await worker.processMediaData(
        {
            output: {
                base_image: "https://example.com/base.png",
                layers: [
                    { url: "https://example.com/layer.png", name: "Layer" },
                ],
            },
        },
        {},
        { taskId: "task-1" },
    );
    expect(worker.processSingleMediaData).toHaveBeenCalledTimes(2);
    expect(result.outputFiles).toHaveLength(2);
    expect(result.outputFiles[1]).toEqual(
        expect.objectContaining({
            url: "https://stored.example.com/layer.png",
            name: "Layer",
        }),
    );
    const recraft = await worker.processMediaData(
        { output: { image: "https://example.com/a.svg", style_id: "style-1" } },
        {},
        { taskId: "task-2" },
    );
    expect(recraft.providerMetadata).toEqual({ styleId: "style-1" });
});

test("Recraft object outputs preserve SVG and reusable style ID, not input references", () => {
    const result = getMediaGenerationOutputs(
        JSON.stringify({
            input: { style_reference_images: ["https://example.com/ref.png"] },
            output: {
                image: "https://example.com/result.svg",
                style_id: "style-123",
            },
        }),
    );
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].url).toBe("https://example.com/result.svg");
    expect(result.providerMetadata).toEqual({ styleId: "style-123" });
});

test("layer decomposition keeps every output plus layer metadata", () => {
    const result = getMediaGenerationOutputs({
        output: {
            base_image: "https://example.com/base.png",
            layers: [
                {
                    url: "https://example.com/layer.png",
                    name: "Person",
                    bbox: [1, 2, 3, 4],
                    order: 1,
                },
            ],
        },
    });
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[1]).toEqual(
        expect.objectContaining({
            name: "Person",
            bbox: [1, 2, 3, 4],
            order: 1,
        }),
    );
});

test("interleaved Lyria output keeps all audio and lyrics", () => {
    const result = getMediaGenerationOutputs({
        output: [
            { url: "https://example.com/1.mp3", type: "audio" },
            { url: "https://example.com/2.mp3", type: "audio" },
        ],
        lyrics: "Verse one",
    });
    expect(result.outputs).toHaveLength(2);
    expect(result.providerMetadata.lyrics).toBe("Verse one");
});

test("already-normalized output is not duplicated from progress artifacts", () => {
    const result = getMediaGenerationOutputs(
        "https://example.com/stored.flac",
        {
            artifacts: [
                { url: "https://example.com/provider.flac", type: "audio" },
            ],
        },
    );
    expect(result.outputs).toEqual([
        { url: "https://example.com/stored.flac" },
    ]);
});

test("empty or invalid results are not treated as downloadable media", () => {
    expect(getMediaGenerationOutputs("not a URL").outputs).toEqual([]);
    expect(
        getMediaGenerationOutputs({
            output: null,
            input: { image: "https://example.com/reference.png" },
        }).outputs,
    ).toEqual([]);
});
