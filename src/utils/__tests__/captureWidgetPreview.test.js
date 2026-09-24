import {
    captureWidgetPreview,
    scaleForWidgetScreenshot,
} from "../captureWidgetPreview.js";

jest.mock("html2canvas", () => ({
    __esModule: true,
    default: jest.fn(async () => ({
        width: 320,
        height: 200,
        toDataURL: () => "data:image/jpeg;base64,SHOT",
    })),
}));

describe("captureWidgetPreview", () => {
    test("scales oversized screenshots down", () => {
        expect(scaleForWidgetScreenshot(1440, 900)).toBeLessThan(1);
        expect(scaleForWidgetScreenshot(320, 200)).toBe(1);
    });

    test("captures the iframe document when available", async () => {
        const iframe = {
            contentDocument: {
                documentElement: document.createElement("div"),
            },
        };
        await expect(
            captureWidgetPreview({ iframe, container: document.body }),
        ).resolves.toBe("data:image/jpeg;base64,SHOT");
    });

    test("returns null when there is nothing to capture", async () => {
        await expect(captureWidgetPreview({})).resolves.toBeNull();
    });
});
