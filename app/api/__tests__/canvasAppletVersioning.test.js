/**
 * @jest-environment node
 */

import {
    applyPublishedAppletSnapshot,
    createAppletHtmlSnapshot,
    createPublishedAppletHtmlSnapshot,
    createPublishedAppletUpdate,
    deleteReplacedPublishedAppletSnapshot,
    hydrateAppletVersionContents,
    resolvePublishedAppletContent,
    resolveAppletVersionContent,
} from "../canvas-applets/versioning";

jest.mock("../utils/media-service-utils", () => ({
    deleteMediaFile: jest.fn(),
    hashBuffer: jest.fn(),
    readBlobContent: jest.fn(),
    uploadBufferToMediaService: jest.fn(),
}));

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findByIdAndUpdate: jest.fn(),
        updateOne: jest.fn(),
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe("createAppletHtmlSnapshot", () => {
    test("derives a durable blob path from the upload URL when media helper omits it", async () => {
        const {
            hashBuffer,
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        hashBuffer.mockResolvedValue("hash123");
        uploadBufferToMediaService.mockResolvedValue({
            data: {
                url: "https://storage.example/cortexfiles-ctx123/applets/versions/applet123/v000001.html?sv=token",
                hash: "hash123",
            },
        });

        const snapshot = await createAppletHtmlSnapshot(
            { _id: "applet123" },
            { contextId: "ctx123" },
            "<html>large</html>",
            { versionIndex: 0 },
        );

        expect(snapshot).toEqual({
            url: "https://storage.example/cortexfiles-ctx123/applets/versions/applet123/v000001.html?sv=token",
            blobPath: "applets/versions/applet123/v000001.html",
            hash: "hash123",
            size: Buffer.byteLength("<html>large</html>", "utf8"),
            contextId: "ctx123",
        });
    });
});

describe("createPublishedAppletHtmlSnapshot", () => {
    test("stores published applet HTML under the app-level published context", async () => {
        const {
            hashBuffer,
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        hashBuffer.mockResolvedValue("hash456");
        uploadBufferToMediaService.mockResolvedValue({
            data: {
                url: "https://storage.example/cortexfiles-concierge-published-applets/applets/published/applet123/v000002.html?sv=token",
                blobPath: "applets/published/applet123/v000002.html",
                hash: "hash456",
            },
        });

        const snapshot = await createPublishedAppletHtmlSnapshot(
            { _id: "applet123" },
            "<html>published</html>",
            { versionIndex: 1 },
        );

        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: expect.stringMatching(/^v000002-/),
                mimeType: "text/html",
            }),
            expect.objectContaining({
                storageTarget: { kind: "applet-published" },
                subPath: "published/applet123",
            }),
        );
        expect(snapshot).toEqual({
            url: "https://storage.example/cortexfiles-concierge-published-applets/applets/published/applet123/v000002.html?sv=token",
            blobPath: "applets/published/applet123/v000002.html",
            hash: "hash456",
            size: Buffer.byteLength("<html>published</html>", "utf8"),
            contextId: "concierge-published-applets",
        });
    });
});

describe("createPublishedAppletUpdate", () => {
    test("returns canonical published artifact fields", async () => {
        const {
            hashBuffer,
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        hashBuffer.mockResolvedValue("hash789");
        uploadBufferToMediaService.mockResolvedValue({
            data: {
                url: "https://storage.example/app.html",
                blobPath: "applets/published/applet123/app.html",
                hash: "hash789",
            },
        });

        const update = await createPublishedAppletUpdate(
            { _id: "applet123" },
            "<html>published</html>",
            { versionIndex: 3 },
        );

        expect(update).toEqual({
            publishedContentUrl: "https://storage.example/app.html",
            publishedContentBlobPath: "applets/published/applet123/app.html",
            publishedContentHash: "hash789",
            publishedContentSize: Buffer.byteLength(
                "<html>published</html>",
                "utf8",
            ),
            publishedContentContextId: "concierge-published-applets",
            publishedContentVersionIndex: 3,
            publishedContentTimestamp: expect.any(Date),
        });
    });
});

describe("applyPublishedAppletSnapshot", () => {
    test("returns the previous canonical published artifact for post-save cleanup", async () => {
        const {
            deleteMediaFile,
            hashBuffer,
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        hashBuffer.mockResolvedValue("new-hash");
        uploadBufferToMediaService.mockResolvedValue({
            data: {
                url: "https://storage.example/new.html",
                blobPath: "applets/published/applet123/new.html",
                hash: "new-hash",
            },
        });

        const applet = {
            _id: "applet123",
            publishedContentBlobPath: "applets/published/applet123/old.html",
            publishedContentHash: "old-hash",
            publishedContentContextId: "concierge-published-applets",
        };

        const result = await applyPublishedAppletSnapshot(
            applet,
            "<html>new</html>",
            {
                versionIndex: 2,
            },
        );

        expect(applet).toEqual(
            expect.objectContaining({
                publishedContentBlobPath:
                    "applets/published/applet123/new.html",
                publishedContentHash: "new-hash",
                publishedContentVersionIndex: 2,
            }),
        );
        expect(result).toEqual({
            previousPublishedSnapshot: {
                publishedContentBlobPath:
                    "applets/published/applet123/old.html",
                publishedContentHash: "old-hash",
                publishedContentContextId: "concierge-published-applets",
            },
            nextPublishedSnapshot: {
                publishedContentBlobPath:
                    "applets/published/applet123/new.html",
                publishedContentHash: "new-hash",
                publishedContentContextId: "concierge-published-applets",
            },
        });
        expect(deleteMediaFile).not.toHaveBeenCalled();

        await deleteReplacedPublishedAppletSnapshot(
            result.previousPublishedSnapshot,
            result.nextPublishedSnapshot,
        );

        expect(deleteMediaFile).toHaveBeenCalledWith({
            blobPath: "applets/published/applet123/old.html",
            hash: null,
            storageTarget: {
                kind: "applet-published",
                contextId: "concierge-published-applets",
            },
        });
    });

    test("does not delete during apply when the published artifact path did not change", async () => {
        const {
            deleteMediaFile,
            hashBuffer,
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        hashBuffer.mockResolvedValue("same-hash");
        uploadBufferToMediaService.mockResolvedValue({
            data: {
                url: "https://storage.example/same.html",
                blobPath: "applets/published/applet123/same.html",
                hash: "same-hash",
            },
        });

        await applyPublishedAppletSnapshot(
            {
                _id: "applet123",
                publishedContentBlobPath:
                    "applets/published/applet123/same.html",
                publishedContentHash: "same-hash",
                publishedContentContextId: "concierge-published-applets",
            },
            "<html>same</html>",
            { versionIndex: 0 },
        );

        expect(deleteMediaFile).not.toHaveBeenCalled();
    });
});

describe("resolveAppletVersionContent", () => {
    test("reads legacy external versions by deriving blob path from contentUrl", async () => {
        const { readBlobContent } = require("../utils/media-service-utils");

        readBlobContent.mockResolvedValue("<html>published</html>");

        await expect(
            resolveAppletVersionContent({
                content: "",
                contentUrl:
                    "https://storage.example/cortexfiles-ctx123/applets/versions/applet123/v000026.html?sv=token",
                contentBlobPath: null,
                contentContextId: "ctx123",
            }),
        ).resolves.toBe("<html>published</html>");

        expect(readBlobContent).toHaveBeenCalledWith(
            "applets/versions/applet123/v000026.html",
            expect.objectContaining({ kind: "applet-global" }),
        );
    });
});

describe("resolvePublishedAppletContent", () => {
    test("prefers the canonical app-level published artifact over the user-scoped version", async () => {
        const { readBlobContent } = require("../utils/media-service-utils");

        readBlobContent.mockResolvedValueOnce("<html>canonical</html>");

        await expect(
            resolvePublishedAppletContent({
                publishedVersionIndex: 0,
                publishedContentBlobPath:
                    "applets/published/applet123/v000001.html",
                htmlVersions: [
                    {
                        content: "",
                        contentBlobPath:
                            "applets/versions/applet123/v000001.html",
                        contentContextId: "user-ctx",
                    },
                ],
            }),
        ).resolves.toBe("<html>canonical</html>");

        expect(readBlobContent).toHaveBeenCalledWith(
            "applets/published/applet123/v000001.html",
            expect.objectContaining({ kind: "applet-published" }),
        );
    });

    test("falls back to legacy version content when no canonical artifact exists", async () => {
        const { readBlobContent } = require("../utils/media-service-utils");

        readBlobContent.mockResolvedValueOnce("<html>legacy</html>");

        await expect(
            resolvePublishedAppletContent({
                publishedVersionIndex: 0,
                htmlVersions: [
                    {
                        content: "",
                        contentBlobPath:
                            "applets/versions/applet123/v000001.html",
                        contentContextId: "user-ctx",
                    },
                ],
            }),
        ).resolves.toBe("<html>legacy</html>");

        expect(readBlobContent).toHaveBeenCalledWith(
            "applets/versions/applet123/v000001.html",
            expect.objectContaining({ kind: "applet-global" }),
        );
    });
});

describe("hydrateAppletVersionContents", () => {
    test("keeps missing external versions without unpublishing during read hydration", async () => {
        const { readBlobContent } = require("../utils/media-service-utils");
        const Applet = require("../models/applet").default;

        readBlobContent
            .mockResolvedValueOnce("<html>v2</html>")
            .mockResolvedValueOnce(null);

        const hydrated = await hydrateAppletVersionContents({
            _id: "applet123",
            publishedVersionIndex: 2,
            htmlVersions: [
                { content: "<html>v1</html>" },
                {
                    content: "",
                    contentBlobPath: "applets/versions/applet123/v000002.html",
                    contentContextId: "ctx123",
                },
                {
                    content: "",
                    contentBlobPath: "applets/versions/applet123/v000003.html",
                    contentContextId: "ctx123",
                },
            ],
        });

        expect(hydrated.htmlVersions).toHaveLength(3);
        expect(hydrated.htmlVersions[1].content).toBe("<html>v2</html>");
        expect(hydrated.htmlVersions[2]).toEqual(
            expect.objectContaining({
                content: "",
                contentBlobPath: "applets/versions/applet123/v000003.html",
            }),
        );
        expect(hydrated.publishedVersionIndex).toBe(2);
        expect(Applet.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("repairs missing contentBlobPath from contentUrl while hydrating", async () => {
        const { readBlobContent } = require("../utils/media-service-utils");
        const Applet = require("../models/applet").default;

        readBlobContent.mockResolvedValue("<html>v1</html>");

        const hydrated = await hydrateAppletVersionContents({
            _id: "applet123",
            publishedVersionIndex: 0,
            htmlVersions: [
                {
                    content: "",
                    contentUrl:
                        "https://storage.example/cortexfiles-ctx123/applets/versions/applet123/v000001.html?sv=token",
                    contentBlobPath: null,
                    contentContextId: "ctx123",
                },
            ],
        });

        expect(hydrated.htmlVersions[0]).toEqual(
            expect.objectContaining({
                content: "<html>v1</html>",
                contentBlobPath: "applets/versions/applet123/v000001.html",
            }),
        );
        expect(hydrated.publishedVersionIndex).toBe(0);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith("applet123", {
            htmlVersions: [
                {
                    content: "",
                    contentUrl:
                        "https://storage.example/cortexfiles-ctx123/applets/versions/applet123/v000001.html?sv=token",
                    contentBlobPath: "applets/versions/applet123/v000001.html",
                    contentContextId: "ctx123",
                },
            ],
            publishedVersionIndex: 0,
        });
    });

    test("rebuilds a missing published v2 saved snapshot from canonical published content", async () => {
        const {
            hashBuffer,
            readBlobContent,
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");
        const Applet = require("../models/applet").default;
        const timestamp = new Date("2026-05-10T00:00:00Z");

        readBlobContent
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce("<html>canonical published</html>");
        hashBuffer.mockResolvedValue("healed-hash");
        uploadBufferToMediaService.mockResolvedValue({
            data: {
                url: "https://storage.example/cortexfiles-ctx123/applets/versions/applet123/v000019.html",
                blobPath: "applets/versions/applet123/v000019.html",
                hash: "healed-hash",
            },
        });

        const hydrated = await hydrateAppletVersionContents(
            {
                _id: "applet123",
                version: 2,
                publishedVersionIndex: 18,
                publishedContentVersionIndex: 18,
                publishedContentBlobPath:
                    "applets/published/applet123/v000019.html",
                publishedContentContextId: "concierge-published-applets",
                htmlVersions: [
                    ...Array.from({ length: 18 }, (_, index) => ({
                        content: `<html>v${index + 1}</html>`,
                        timestamp,
                    })),
                    {
                        content: "",
                        contentBlobPath:
                            "applets/versions/applet123/missing-v000019.html",
                        contentContextId: "ctx123",
                        timestamp,
                    },
                    { content: "<html>v20</html>", timestamp },
                ],
            },
            { contextId: "ctx123" },
        );

        expect(readBlobContent).toHaveBeenNthCalledWith(
            1,
            "applets/versions/applet123/missing-v000019.html",
            expect.objectContaining({ kind: "applet-global" }),
        );
        expect(readBlobContent).toHaveBeenNthCalledWith(
            2,
            "applets/published/applet123/v000019.html",
            expect.objectContaining({ kind: "applet-published" }),
        );
        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: expect.stringMatching(/^v000019-/),
                hash: "healed-hash",
                mimeType: "text/html",
            }),
            expect.objectContaining({
                storageTarget: {
                    kind: "applet-global",
                    userContextId: "ctx123",
                },
                subPath: "versions/applet123",
            }),
        );
        expect(hydrated.htmlVersions[18]).toEqual(
            expect.objectContaining({
                content: "<html>canonical published</html>",
                contentBlobPath: "applets/versions/applet123/v000019.html",
                contentContextId: "ctx123",
                contentHash: "healed-hash",
                timestamp,
            }),
        );
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith("applet123", {
            htmlVersions: expect.arrayContaining([
                expect.objectContaining({
                    content: "",
                    contentBlobPath: "applets/versions/applet123/v000019.html",
                    contentContextId: "ctx123",
                    contentHash: "healed-hash",
                    timestamp,
                }),
            ]),
            publishedVersionIndex: 18,
        });
    });
});
