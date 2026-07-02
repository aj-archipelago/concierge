import { buildMediaModelControls } from "../mediaModelControls";

describe("buildMediaModelControls", () => {
    test("derives caller-facing controls from Media-page option families", () => {
        const controls = buildMediaModelControls({
            availableAspectRatios: ["1:1", "16:9", "9:16", "match_input_image"],
            availableImageSizes: ["1K", "2K"],
            availableResolutions: ["720p", "1080p"],
            availableDurations: [5, 8],
            availableOutputFormats: [
                { value: "png", label: "PNG" },
                { value: "jpg", label: "JPG" },
            ],
            mediaToggles: ["optimizePrompt"],
        });

        expect(controls).toEqual([
            {
                key: "aspectRatio",
                label: "Aspect Ratio",
                type: "select",
                options: [
                    { value: "1:1", label: "1:1" },
                    { value: "16:9", label: "16:9" },
                    { value: "9:16", label: "9:16" },
                    {
                        value: "match_input_image",
                        label: "Match Input Image",
                    },
                ],
            },
            {
                key: "image_size",
                aliases: ["imageSize", "size"],
                label: "Image Size",
                type: "select",
                options: [
                    { value: "1K", label: "1K" },
                    { value: "2K", label: "2K" },
                ],
            },
            {
                key: "resolution",
                label: "Resolution",
                type: "select",
                options: [
                    { value: "720p", label: "720p" },
                    { value: "1080p", label: "1080p" },
                ],
            },
            {
                key: "duration",
                label: "Duration",
                type: "select",
                options: [
                    { value: 5, label: "5s" },
                    { value: 8, label: "8s" },
                ],
            },
            {
                key: "outputFormat",
                label: "Output Format",
                type: "select",
                options: [
                    { value: "png", label: "PNG" },
                    { value: "jpg", label: "JPG" },
                ],
            },
            {
                key: "optimizePrompt",
                label: "Optimize Prompt",
                type: "boolean",
                trueLabel: "Optimized",
                falseLabel: "Raw Prompt",
            },
        ]);
    });

    test("can derive only non-dedicated controls for the Media page", () => {
        const controls = buildMediaModelControls(
            {
                availableAspectRatios: ["1:1", "16:9"],
                availableOutputFormats: [{ value: "png", label: "PNG" }],
                mediaToggles: ["optimizePrompt", "forceInstrumental"],
            },
            {
                derivedControlKeys: ["outputFormat"],
                excludedToggleKeys: ["optimizePrompt"],
            },
        );

        expect(controls).toEqual([
            {
                key: "outputFormat",
                label: "Output Format",
                type: "select",
                options: [{ value: "png", label: "PNG" }],
            },
            {
                key: "forceInstrumental",
                label: "Instrumental",
                type: "boolean",
                trueLabel: "Instrumental",
                falseLabel: "Vocals allowed",
            },
        ]);
    });

    test("enriches existing bare controls instead of duplicating them", () => {
        const controls = buildMediaModelControls({
            mediaControls: [{ key: "aspectRatio" }],
            availableAspectRatios: ["1:1", "16:9"],
        });

        expect(controls).toEqual([
            {
                key: "aspectRatio",
                label: "Aspect Ratio",
                type: "select",
                options: [
                    { value: "1:1", label: "1:1" },
                    { value: "16:9", label: "16:9" },
                ],
            },
        ]);
    });
});
