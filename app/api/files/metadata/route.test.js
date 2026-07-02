/**
 * @jest-environment node
 */

const mockChatFind = jest.fn();
const mockMediaFind = jest.fn();
const mockAppletFind = jest.fn();
const mockAutomationFind = jest.fn();
const mockGetCurrentUser = jest.fn();

jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: { find: mockChatFind },
}));

jest.mock("../../models/media-item.mjs", () => ({
    __esModule: true,
    default: { find: mockMediaFind },
}));

jest.mock("../../models/applet.js", () => ({
    __esModule: true,
    default: { find: mockAppletFind },
}));

jest.mock("../../models/automation.js", () => ({
    __esModule: true,
    default: { find: mockAutomationFind },
}));

jest.mock("../../utils/auth", () => ({
    getCurrentUser: (...args) => mockGetCurrentUser(...args),
    handleError: (error) =>
        new Response(JSON.stringify({ error: error.message }), { status: 500 }),
}));

const { POST } = require("./route");

function leanResult(value) {
    return {
        lean: jest.fn(async () => value),
    };
}

function makeRequest(body) {
    return {
        json: async () => body,
    };
}

describe("POST /api/files/metadata", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCurrentUser.mockResolvedValue({
            _id: "507f191e810c19729de860aa",
        });
        mockChatFind.mockReturnValue(leanResult([]));
        mockMediaFind.mockReturnValue(leanResult([]));
        mockAppletFind.mockReturnValue(leanResult([]));
        mockAutomationFind.mockReturnValue(leanResult([]));
    });

    it("returns chat folder titles and media thumbnails for old filesystem paths", async () => {
        const chatId = "507f191e810c19729de860ea";
        mockChatFind.mockReturnValue(
            leanResult([
                {
                    _id: chatId,
                    title: "Trip planning",
                    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
                },
            ]),
        );
        mockMediaFind.mockReturnValue(
            leanResult([
                {
                    _id: "media-1",
                    blobPath: "media/videos/launch.mp4",
                    prompt: "launch clip",
                    type: "video",
                    status: "completed",
                    model: "video-model",
                    thumbnailAzureUrl: "https://example.test/thumb.jpg",
                    thumbnailBlobPath: "media/video-thumbnails/launch.jpg",
                    thumbnailHash: "thumb-hash",
                },
            ]),
        );

        const response = await POST(
            makeRequest({
                folderPaths: [`/workspace/files/chats/${chatId}`],
                blobPaths: [
                    "/workspace/files/media/videos/launch.mp4?download=true",
                ],
            }),
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.folders[`chats/${chatId}`]).toMatchObject({
            kind: "chat",
            entityId: chatId,
            displayName: "Trip planning",
        });
        expect(body.files["media/videos/launch.mp4"]).toMatchObject({
            kind: "video",
            displayName: "launch",
            thumbnailUrl: "https://example.test/thumb.jpg",
            thumbnailBlobPath: "media/video-thumbnails/launch.jpg",
            _mediaItem: {
                _id: "media-1",
                type: "video",
                status: "completed",
                thumbnailHash: "thumb-hash",
            },
        });
    });

    it("returns an empty catalog for unauthenticated filesystem browsing", async () => {
        mockGetCurrentUser.mockResolvedValue(null);

        const response = await POST(
            makeRequest({
                folderPaths: ["chats/507f191e810c19729de860ea"],
                blobPaths: ["media/image.png"],
            }),
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ folders: {}, files: {} });
        expect(mockChatFind).not.toHaveBeenCalled();
        expect(mockMediaFind).not.toHaveBeenCalled();
    });

    it("returns automation, applet version, and article labels from storage paths", async () => {
        mockAutomationFind.mockReturnValue(
            leanResult([
                {
                    _id: "automation-1",
                    slug: "morning-brief",
                    name: "Morning brief",
                    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
                },
            ]),
        );
        mockAppletFind.mockReturnValue(
            leanResult([
                {
                    _id: "applet-1",
                    name: "Weather board",
                    filePath: "/workspace/files/applets/weather/draft.html",
                    publishedContentBlobPath: "applets/weather/published.html",
                    htmlVersions: [
                        {
                            contentBlobPath: "applets/weather/v1.html",
                        },
                    ],
                    updatedAt: new Date("2026-06-03T00:00:00.000Z"),
                },
            ]),
        );

        const response = await POST(
            makeRequest({
                folderPaths: ["automations/morning-brief"],
                blobPaths: [
                    "applets/weather/v1.html",
                    "articles/2026-06-01_product_update.md",
                ],
            }),
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.folders["automations/morning-brief"]).toMatchObject({
            kind: "automation",
            entityId: "automation-1",
            displayName: "Morning brief",
        });
        expect(body.files["applets/weather/v1.html"]).toMatchObject({
            kind: "applet",
            entityId: "applet-1",
            displayName: "Weather board",
            appletId: "applet-1",
        });
        expect(body.files["articles/2026-06-01_product_update.md"]).toEqual({
            kind: "article",
            displayName: "2026 06 01 product update",
        });
    });
});
