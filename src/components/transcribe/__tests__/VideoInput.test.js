/**
 * @jest-environment jsdom
 */

import { isValidUrl, isCloudStorageUrl, checkVideoUrl } from "../VideoInput";

// Store original document.createElement
const originalCreateElement = document.createElement;

// Mock the config modules
jest.mock("../../../../config/default/config", () => ({
    __esModule: true,
    default: {
        endpoints: {
            mediaHelper: (url) => `${url}/media-helper`,
        },
    },
}));

jest.mock("../../../../app.config/config", () => ({
    __esModule: true,
    default: {},
}));

jest.mock("../../../../config", () => ({
    __esModule: true,
    default: {
        endpoints: {
            mediaHelper: (url) => `${url}/media-helper`,
        },
    },
}));

jest.mock("../../../App", () => ({
    ServerContext: {
        Provider: ({ children }) => children,
    },
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../VideoSelector", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../../../contexts/LanguageProvider", () => ({
    LanguageContext: {
        Provider: ({ children }) => children,
    },
}));

// Mock the video element functionality
class MockVideoElement {
    constructor() {
        this.preload = "";
        this.crossOrigin = "";
        this.src = "";
        this._duration = 0;
        setTimeout(() => {
            if (this.onloadedmetadata && !this._errorToTrigger) {
                this.onloadedmetadata();
            }
            if (this.onerror && this._errorToTrigger) {
                this.onerror(this._errorToTrigger);
            }
        }, 0);
    }

    remove() {}

    set duration(value) {
        this._duration = value;
    }

    get duration() {
        return this._duration;
    }

    triggerError(error) {
        this._errorToTrigger = error;
    }
}

describe("URL Validation Functions", () => {
    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
        // Reset document.createElement to original before each test
        document.createElement = originalCreateElement;
    });

    afterEach(() => {
        // Clean up after each test
        jest.restoreAllMocks();
    });

    describe("isValidUrl", () => {
        it("should return true for valid URLs", () => {
            expect(isValidUrl("https://example.com/video.mp4")).toBe(true);
            expect(isValidUrl("http://test.com")).toBe(true);
            expect(
                isValidUrl("https://storage.googleapis.com/bucket/video.mp4"),
            ).toBe(true);
        });

        it("should return false for invalid URLs", () => {
            expect(isValidUrl("not-a-url")).toBe(false);
            expect(isValidUrl("http://")).toBe(false);
            expect(isValidUrl("")).toBe(false);
        });
    });

    describe("isCloudStorageUrl", () => {
        it("should identify Azure Blob Storage URLs", () => {
            expect(
                isCloudStorageUrl(
                    "https://myaccount.blob.core.windows.net/container/video.mp4",
                ),
            ).toBe(true);
        });

        it("should identify Google Cloud Storage URLs", () => {
            expect(
                isCloudStorageUrl(
                    "https://storage.googleapis.com/bucket/video.mp4",
                ),
            ).toBe(true);
            expect(
                isCloudStorageUrl(
                    "https://storage.cloud.google.com/bucket/video.mp4",
                ),
            ).toBe(true);
        });

        it("should identify AWS S3 URLs", () => {
            expect(
                isCloudStorageUrl("https://bucket.s3.amazonaws.com/video.mp4"),
            ).toBe(true);
            expect(
                isCloudStorageUrl(
                    "https://bucket.s3-us-west-2.amazonaws.com/video.mp4",
                ),
            ).toBe(true);
        });

        it("should identify AWS CloudFront URLs", () => {
            expect(
                isCloudStorageUrl("https://d1234.cloudfront.net/video.mp4"),
            ).toBe(true);
        });

        it("should identify DigitalOcean Spaces URLs", () => {
            expect(
                isCloudStorageUrl(
                    "https://bucket.digitaloceanspaces.com/video.mp4",
                ),
            ).toBe(true);
        });

        it("should return false for non-cloud storage URLs", () => {
            expect(isCloudStorageUrl("https://example.com/video.mp4")).toBe(
                false,
            );
            expect(isCloudStorageUrl("https://youtube.com/watch?v=123")).toBe(
                false,
            );
        });
    });
});

describe("checkVideoUrl", () => {
    let consoleErrorSpy;
    let consoleWarnSpy;

    beforeAll(() => {
        // Set up fetch mock
        global.fetch = jest.fn();
        // Set up console spies
        consoleErrorSpy = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});
        consoleWarnSpy = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {});
    });

    afterAll(() => {
        // Clean up spies
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        // Clean up fetch mock
        delete global.fetch;
    });

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
        // Reset fetch mock
        global.fetch.mockReset();

        // Reset document.createElement for each test
        document.createElement = (tag) => {
            if (tag === "video") {
                return new MockVideoElement();
            }
            return originalCreateElement(tag);
        };
    });

    afterEach(() => {
        // Clean up after each test
        document.createElement = originalCreateElement;
    });

    it("should validate a regular video URL successfully", async () => {
        global.fetch.mockResolvedValueOnce({
            headers: {
                get: () => "video/mp4",
            },
        });

        const result = await checkVideoUrl("https://example.com/video.mp4");
        expect(result).toBe(true);
        expect(fetch).toHaveBeenCalledWith("https://example.com/video.mp4", {
            method: "HEAD",
        });
    });

    it("should skip HEAD request for cloud storage URLs", async () => {
        const result = await checkVideoUrl(
            "https://storage.googleapis.com/bucket/video.mp4",
        );
        expect(result).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("should reject non-video content types", async () => {
        global.fetch.mockResolvedValueOnce({
            headers: {
                get: () => "text/html",
            },
        });

        const result = await checkVideoUrl(
            "https://example.com/not-a-video.html",
        );
        expect(result).toBe(false);
    });

    it("should handle videos longer than 60 minutes", async () => {
        global.fetch.mockResolvedValueOnce({
            headers: {
                get: () => "video/mp4",
            },
        });

        // Mock video duration to be 61 minutes
        const mockVideo = new MockVideoElement();
        mockVideo.duration = 3660; // 61 minutes in seconds
        document.createElement = jest.fn().mockReturnValue(mockVideo);

        const result = await checkVideoUrl(
            "https://example.com/long-video.mp4",
        );
        expect(result).toBe("Video length exceeds 60 minutes");
    });

    it("should handle CORS errors for cloud storage URLs", async () => {
        const mockVideo = new MockVideoElement();
        mockVideo.triggerError(new Error("CORS error"));
        document.createElement = jest.fn().mockReturnValue(mockVideo);

        const result = await checkVideoUrl(
            "https://storage.googleapis.com/bucket/video.mp4",
        );
        expect(result).toBe(true);
    });

    it("should handle CORS errors for non-cloud storage URLs", async () => {
        global.fetch.mockRejectedValueOnce(new Error("CORS error"));

        const mockVideo = new MockVideoElement();
        mockVideo.triggerError(new Error("CORS error"));
        document.createElement = jest.fn().mockReturnValue(mockVideo);

        const result = await checkVideoUrl("https://example.com/video.mp4");
        expect(result).toBe("CORS error");
    });

    it("should handle network errors during HEAD request", async () => {
        global.fetch.mockImplementationOnce(() =>
            Promise.reject(new Error("Network error")),
        );

        const mockVideo = new MockVideoElement();
        mockVideo.triggerError(new Error("Network error"));
        document.createElement = jest.fn().mockReturnValue(mockVideo);

        const result = await checkVideoUrl("https://example.com/video.mp4");
        expect(result).toBe("Network error");
    }, 10000);

    it("should clean up video element after check", async () => {
        const mockRemove = jest.fn();
        const mockVideo = new MockVideoElement();
        mockVideo.remove = mockRemove;
        document.createElement = jest.fn().mockReturnValue(mockVideo);

        await checkVideoUrl("https://example.com/video.mp4");
        expect(mockRemove).toHaveBeenCalled();
    });
});
