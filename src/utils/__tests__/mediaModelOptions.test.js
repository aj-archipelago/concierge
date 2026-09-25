import {
    resolveMediaModelOptions,
    reconcileMediaModelOptions,
} from "../mediaModelOptions";

const seedream = {
    mediaDefaults: { layerDecomposition: false, image_size: "2K" },
    availableImageSizes: ["1K", "1.5K", "2K", "auto"],
    mediaDefaultOverrides: [
        {
            when: { layerDecomposition: false },
            mediaOptions: { image_size: ["1K", "2K"] },
        },
        {
            when: { layerDecomposition: true },
            mediaOptions: { image_size: ["1K", "1.5K", "2K", "auto"] },
        },
    ],
};
const ltx = {
    mediaDefaults: { duration: 6, fps: 25, resolution: "1080p" },
    availableResolutions: ["720p", "1080p", "2k", "4k"],
    mediaControls: [
        {
            key: "fps",
            options: [24, 25, 48, 50].map((value) => ({
                value,
                label: String(value),
            })),
        },
    ],
    mediaDefaultOverrides: [
        {
            when: { duration: [12, 14, 16, 18, 20] },
            mediaOptions: { resolution: ["720p", "1080p"], fps: [24, 25] },
        },
    ],
};

test("Seedream standard only offers standard sizes while layers retain all sizes", () => {
    expect(resolveMediaModelOptions(seedream).availableImageSizes).toEqual([
        "1K",
        "2K",
    ]);
    expect(
        resolveMediaModelOptions(seedream, { layerDecomposition: true })
            .availableImageSizes,
    ).toEqual(seedream.availableImageSizes);
    expect(seedream.availableImageSizes).toEqual(["1K", "1.5K", "2K", "auto"]);
});

test("switching from layers to standard resets invalid size across all request aliases", () => {
    const result = reconcileMediaModelOptions(seedream, {
        layerDecomposition: false,
        image_size: "auto",
        imageSize: "auto",
        size: "auto",
    });
    expect(result).toEqual({
        layerDecomposition: false,
        image_size: "2K",
        imageSize: "2K",
        size: "2K",
    });
    expect(
        reconcileMediaModelOptions(seedream, { image_size: "1K" }).image_size,
    ).toBe("1K");
});

test("LTX long clips only offer supported resolutions and frame rates", () => {
    const resolved = resolveMediaModelOptions(ltx, { duration: 12 });
    expect(resolved.availableResolutions).toEqual(["720p", "1080p"]);
    expect(
        resolved.mediaControls[0].options.map((option) => option.value),
    ).toEqual([24, 25]);
    expect(resolveMediaModelOptions(ltx, { duration: 6 })).toBe(ltx);
    expect(
        reconcileMediaModelOptions(ltx, {
            duration: 12,
            resolution: "4k",
            fps: 50,
        }),
    ).toEqual({ duration: 12, resolution: "1080p", fps: 25 });
});

test("unrelated model settings and explicit false or zero controls are preserved", () => {
    const settings = { watermark: false, cloningStrength: 0, size: "auto" };
    expect(reconcileMediaModelOptions({}, settings)).toEqual(settings);
    expect(resolveMediaModelOptions(undefined)).toBeUndefined();
});
