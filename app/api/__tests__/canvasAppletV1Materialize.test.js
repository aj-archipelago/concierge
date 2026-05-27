/**
 * @jest-environment node
 */

import { ensureAppletWorkspaceFile } from "../canvas-applets/files";

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findByIdAndUpdate: jest.fn(),
    },
}));

const mockFileSave = jest.fn();
jest.mock("../models/file", () => {
    function FakeFile(doc) {
        Object.assign(this, doc);
        this.save = mockFileSave;
    }
    FakeFile.findOne = jest.fn();
    return { __esModule: true, default: FakeFile };
});

jest.mock("../utils/media-service-utils", () => ({
    checkMediaFile: jest.fn(),
    deleteMediaFile: jest.fn(),
    hashBuffer: jest.fn(async () => "hash-abc"),
    readBlobContent: jest.fn(),
    uploadBufferToMediaService: jest.fn(),
}));

jest.mock("../../../src/utils/storageTargets", () => ({
    createAppletGlobalStorageTarget: jest.fn((userContextId) => ({
        kind: "applet-global",
        userContextId,
    })),
}));

describe("ensureAppletWorkspaceFile", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFileSave.mockReset();
    });

    test("no-op when applet already has filePath", async () => {
        const Applet = require("../models/applet").default;
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        const applet = {
            _id: "a1",
            html: "<html></html>",
            filePath: "https://example.com/x.html",
        };

        const result = await ensureAppletWorkspaceFile(applet, {
            _id: "u1",
            contextId: "ctx1",
        });

        expect(result).toBe(applet);
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
        expect(Applet.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("no-op when applet has no html source content", async () => {
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        const applet = { _id: "a1", htmlVersions: [] };
        const result = await ensureAppletWorkspaceFile(applet, {
            _id: "u1",
            contextId: "ctx1",
        });

        expect(result).toBe(applet);
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
    });

    test("uploads html, saves File record, and sets filePath on applet", async () => {
        const Applet = require("../models/applet").default;
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");
        const {
            createAppletGlobalStorageTarget,
        } = require("../../../src/utils/storageTargets");

        uploadBufferToMediaService.mockResolvedValue({
            success: true,
            data: {
                url: "https://example.blob.core.windows.net/container/applets/old-applet-a1.html",
                hash: "hash-abc",
                blobPath: "applets/old-applet-a1.html",
                filename: "old-applet-a1.html",
            },
        });
        Applet.findByIdAndUpdate.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: "a1",
                name: "Old Applet",
                version: 1,
                html: "<html>v1</html>",
                filePath:
                    "https://example.blob.core.windows.net/container/applets/old-applet-a1.html",
            }),
        });
        mockFileSave.mockResolvedValue();

        const result = await ensureAppletWorkspaceFile(
            {
                _id: "a1",
                name: "Old Applet",
                version: 1,
                html: "<html>v1</html>",
            },
            { _id: "u1", contextId: "ctx1" },
        );

        expect(createAppletGlobalStorageTarget).toHaveBeenCalledWith("ctx1");
        expect(uploadBufferToMediaService).toHaveBeenCalledTimes(1);

        const uploadCall = uploadBufferToMediaService.mock.calls[0];
        const uploadedBuffer = uploadCall[0];
        const uploadedMetadata = uploadCall[1];
        expect(uploadedMetadata.filename).toBe("old-applet-a1.html");
        expect(uploadedMetadata.mimeType).toBe("text/html");
        expect(uploadedMetadata.hash).toBe("hash-abc");
        const uploadedHtml = uploadedBuffer.toString("utf8");
        expect(uploadedHtml).toContain('name="concierge-type"');
        expect(uploadedHtml).toContain('content="applet"');
        expect(uploadedHtml).toContain('name="applet-id"');
        expect(uploadedHtml).toContain('content="a1"');

        expect(mockFileSave).toHaveBeenCalledTimes(1);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            "a1",
            {
                filePath:
                    "https://example.blob.core.windows.net/container/applets/old-applet-a1.html",
            },
            { new: true },
        );
        expect(result.filePath).toBe(
            "https://example.blob.core.windows.net/container/applets/old-applet-a1.html",
        );
    });

    test("falls back to published version content when html is empty", async () => {
        const Applet = require("../models/applet").default;
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        uploadBufferToMediaService.mockResolvedValue({
            success: true,
            data: {
                url: "https://example.blob.core.windows.net/container/applets/applet-a1.html",
                hash: "hash-abc",
                blobPath: "applets/applet-a1.html",
            },
        });
        Applet.findByIdAndUpdate.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ _id: "a1", filePath: "x" }),
        });
        mockFileSave.mockResolvedValue();

        await ensureAppletWorkspaceFile(
            {
                _id: "a1",
                html: "",
                publishedVersionIndex: 0,
                htmlVersions: [{ content: "<html>published</html>" }],
            },
            { _id: "u1", contextId: "ctx1" },
        );

        const uploadedHtml =
            uploadBufferToMediaService.mock.calls[0][0].toString("utf8");
        expect(uploadedHtml).toContain("<html>published</html>");
    });

    test("resolves externalized published version content when materializing", async () => {
        const Applet = require("../models/applet").default;
        const {
            readBlobContent,
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        readBlobContent.mockResolvedValue("<html>external published</html>");
        uploadBufferToMediaService.mockResolvedValue({
            success: true,
            data: {
                url: "https://example.blob.core.windows.net/container/applets/applet-a1.html",
                hash: "hash-abc",
                blobPath: "applets/applet-a1.html",
            },
        });
        Applet.findByIdAndUpdate.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ _id: "a1", filePath: "x" }),
        });
        mockFileSave.mockResolvedValue();

        await ensureAppletWorkspaceFile(
            {
                _id: "a1",
                html: "",
                publishedVersionIndex: 0,
                htmlVersions: [
                    {
                        content: "",
                        contentBlobPath: "applets/versions/a1/v000001.html",
                        contentContextId: "ctx1",
                    },
                ],
            },
            { _id: "u1", contextId: "ctx1" },
        );

        expect(readBlobContent).toHaveBeenCalledWith(
            "applets/versions/a1/v000001.html",
            {
                kind: "applet-global",
                userContextId: "ctx1",
            },
        );
        const uploadedHtml =
            uploadBufferToMediaService.mock.calls[0][0].toString("utf8");
        expect(uploadedHtml).toContain("<html>external published</html>");
    });

    test("returns original applet on upload failure", async () => {
        const Applet = require("../models/applet").default;
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        uploadBufferToMediaService.mockResolvedValue({
            error: { status: 500 },
        });

        const applet = {
            _id: "a1",
            name: "Old",
            html: "<html>v1</html>",
        };
        const result = await ensureAppletWorkspaceFile(applet, {
            _id: "u1",
            contextId: "ctx1",
        });

        expect(result).toBe(applet);
        expect(Applet.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("no-op when user has no contextId", async () => {
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        const applet = { _id: "a1", html: "<html></html>" };
        const result = await ensureAppletWorkspaceFile(applet, { _id: "u1" });

        expect(result).toBe(applet);
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
    });
});
