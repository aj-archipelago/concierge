/**
 * @jest-environment node
 */

import { GET } from "../image-proxy/route";
import {
    isGeneratedAppletCoverUrl,
    isSameCoverBlob,
} from "../canvas-applets/cover-image";
import { validateAppletAccess } from "../applet/access.js";
import Applet from "../models/applet";
import App from "../models/app";
import MediaItem from "../models/media-item.mjs";
import User from "../models/user.mjs";
import { getCurrentUser } from "../utils/auth.js";
import {
    fetchAllowedBlobUrl,
    fetchShortLivedUrl,
} from "../utils/llm-file-utils.js";
import { checkMediaFile } from "../utils/media-service-utils.js";

jest.mock("../utils/auth.js", () => ({ getCurrentUser: jest.fn() }));
jest.mock("../applet/access.js", () => ({ validateAppletAccess: jest.fn() }));
jest.mock("../models/applet", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../models/app", () => ({
    __esModule: true,
    default: { find: jest.fn() },
    APP_TYPES: { APPLET: "applet" },
    APP_STATUS: { ACTIVE: "active" },
}));
jest.mock("../models/media-item.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));
jest.mock("../models/user.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));
jest.mock("../utils/llm-file-utils.js", () => ({
    fetchShortLivedUrl: jest.fn(),
    fetchAllowedBlobUrl: jest.fn(),
    validateAllowedBlobUrl: jest.fn(),
    extractBlobPathFromUrl: jest.fn(),
    extractHashFromBlobUrl: jest.fn(),
}));
jest.mock("../utils/media-service-utils.js", () => ({
    checkMediaFile: jest.fn(),
}));

const appletId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const blobPath = `applets/assets/${appletId}/card-art-dark-123abc.png`;
const origin = "https://examplefiles.blob.core.windows.net";
const staleUrl = `${origin}/cortexfiles-owner-context/${blobPath}?sig=expired`;
const freshUrl = staleUrl.replace("expired", "fresh");
const viewer = { _id: "viewer", contextId: "viewer-context" };

function query(value) {
    return {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(value),
    };
}

function request(url = staleUrl, hints = {}) {
    const params = new URLSearchParams({ url, ...hints });
    return new Request(`http://localhost/api/image-proxy?${params}`);
}

describe("generated app cover renewal", () => {
    beforeEach(() => {
        jest.resetAllMocks();
        getCurrentUser.mockResolvedValue(viewer);
        validateAppletAccess.mockResolvedValue(null);
        Applet.findById.mockReturnValue(
            query({ _id: appletId, owner: "owner" }),
        );
        App.find.mockReturnValue(query([{ imageDarkUrl: staleUrl }]));
        MediaItem.find.mockReturnValue(query([]));
        User.find.mockReturnValue(
            query([{ _id: "owner", contextId: "owner-context" }]),
        );
        fetchAllowedBlobUrl
            .mockResolvedValueOnce(new Response("", { status: 403 }))
            .mockResolvedValueOnce(
                new Response("cover bytes", {
                    headers: { "content-type": "image/png" },
                }),
            );
        fetchShortLivedUrl.mockResolvedValue({ url: freshUrl });
    });

    it("renews a saved owner cover for a different viewer without a legacy media record", async () => {
        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("cover bytes");
        expect(validateAppletAccess).toHaveBeenCalledWith(appletId, viewer);
        expect(App.find).toHaveBeenCalledWith({
            appletId,
            type: "applet",
            status: "active",
        });
        expect(fetchShortLivedUrl).toHaveBeenCalledWith({
            blobPath,
            hash: null,
            contextId: "owner-context",
            storageAuthorization: expect.objectContaining({
                targets: [
                    {
                        owner: "owner-context",
                        path: blobPath,
                        actions: ["read"],
                    },
                ],
            }),
        });
        expect(fetchAllowedBlobUrl).toHaveBeenLastCalledWith(freshUrl, {});
        expect(response.headers.get("cache-control")).toBe(
            "private, max-age=300",
        );
    });

    it("ignores caller storage hints before any resolution or signing", async () => {
        const response = await GET(
            request(staleUrl, {
                contextId: "unrelated-context",
                blobPath: "private/unrelated.png",
                fileScope: "media",
            }),
        );
        expect(response.status).toBe(200);
        expect(checkMediaFile).not.toHaveBeenCalled();
        expect(fetchShortLivedUrl).toHaveBeenCalledWith({
            blobPath,
            hash: null,
            contextId: "owner-context",
            storageAuthorization: expect.objectContaining({
                targets: [
                    {
                        owner: "owner-context",
                        path: blobPath,
                        actions: ["read"],
                    },
                ],
            }),
        });
    });

    it("can renew a cover when the viewer has no storage context", async () => {
        getCurrentUser.mockResolvedValue({ _id: "viewer" });
        expect((await GET(request())).status).toBe(200);
        expect(fetchShortLivedUrl).toHaveBeenCalledWith(
            expect.objectContaining({ contextId: "owner-context" }),
        );
    });

    it.each([
        staleUrl.replace("/cortexfiles-", "/cortexfiles-dev-"),
        staleUrl.replace("/cortexfiles-", "/cortexfiles-local-"),
        staleUrl.replace(
            `${origin}/cortexfiles-`,
            "http://localhost:10000/devstoreaccount1/cortexfiles-local-",
        ),
        staleUrl
            .replace(
                `${origin}/cortexfiles-`,
                "http://127.0.0.1:10000/devstoreaccount1/cortexfiles-local-",
            )
            .replace("applets/assets/", "assets/"),
    ])("renews generated covers in dev and local storage: %s", async (url) => {
        App.find.mockReturnValue(query([{ imageUrl: url }]));
        fetchShortLivedUrl.mockResolvedValue({
            url: url.replace("expired", "fresh"),
        });
        expect((await GET(request(url))).status).toBe(200);
        expect(fetchShortLivedUrl).toHaveBeenCalledWith(
            expect.objectContaining({ contextId: "owner-context" }),
        );
    });

    it("uses matching media provenance for an editor-created theme variant", async () => {
        const editorUrl = staleUrl.replace("owner-context", "editor-context");
        App.find.mockReturnValue(query([{ imageLightUrl: "another image" }]));
        MediaItem.find.mockReturnValue(
            query([{ user: "editor", azureUrl: editorUrl }]),
        );
        User.find.mockImplementation(({ _id }) =>
            query(
                [
                    { _id: "owner", contextId: "owner-context" },
                    { _id: "editor", contextId: "editor-context" },
                ].filter((candidate) => _id.$in.includes(candidate._id)),
            ),
        );
        fetchShortLivedUrl.mockResolvedValue({
            url: editorUrl.replace("expired", "fresh"),
        });

        expect((await GET(request(editorUrl))).status).toBe(200);
        expect(MediaItem.find).toHaveBeenCalledWith({
            outputFolder: {
                $in: [`assets/${appletId}`, `applets/assets/${appletId}`],
            },
            type: "image",
            status: "completed",
            tags: "applet-card",
        });
        expect(fetchShortLivedUrl).toHaveBeenCalledWith(
            expect.objectContaining({ contextId: "editor-context" }),
        );
    });

    it.each([403, 404])(
        "stops before provenance lookup or signing when app access fails (%i)",
        async (status) => {
            validateAppletAccess.mockRejectedValue(
                Object.assign(new Error("Applet not found"), { status }),
            );
            expect((await GET(request())).status).toBe(status);
            expect(App.find).not.toHaveBeenCalled();
            expect(MediaItem.find).not.toHaveBeenCalled();
            expect(User.find).not.toHaveBeenCalled();
            expect(fetchShortLivedUrl).not.toHaveBeenCalled();
        },
    );

    it("does not renew covers without an active app record", async () => {
        App.find.mockReturnValue(query([]));
        expect((await GET(request())).status).toBe(404);
        expect(fetchShortLivedUrl).not.toHaveBeenCalled();
    });

    it("does not renew an unsaved blob just because its filename names an accessible app", async () => {
        const response = await GET(
            request(staleUrl.replace("123abc", "unknown")),
        );
        expect(response.status).toBe(404);
        expect(fetchShortLivedUrl).not.toHaveBeenCalled();
    });

    it.each(["cortexfiles", "cortexfiles-dev", "cortexfiles-local"])(
        "rejects a saved cover in an unrelated user's %s container",
        async (containerBase) => {
            const spoofedUrl = staleUrl
                .replace("/cortexfiles-", `/${containerBase}-`)
                .replace("owner-context", "unrelated-context");
            App.find.mockReturnValue(query([{ imageUrl: spoofedUrl }]));
            // An unrelated media record must not confer its creator's authority.
            MediaItem.find.mockReturnValue(
                query([{ user: "unrelated", azureUrl: staleUrl }]),
            );
            expect((await GET(request(spoofedUrl))).status).toBe(403);
            expect(User.find).toHaveBeenCalledWith({ _id: { $in: ["owner"] } });
            expect(fetchShortLivedUrl).not.toHaveBeenCalled();
        },
    );

    it("does not renew an editor cover without matching media provenance", async () => {
        const editorUrl = staleUrl.replace("owner-context", "editor-context");
        App.find.mockReturnValue(query([{ imageUrl: editorUrl }]));
        expect((await GET(request(editorUrl))).status).toBe(403);
        expect(fetchShortLivedUrl).not.toHaveBeenCalled();
    });

    it("preserves failure when storage cannot refresh the image", async () => {
        fetchShortLivedUrl.mockResolvedValue(null);
        expect((await GET(request())).status).toBe(403);
        expect(fetchAllowedBlobUrl).toHaveBeenCalledTimes(1);
    });

    it.each([
        freshUrl.replace("123abc", "another"),
        freshUrl.replace("owner-context", "another-context"),
        freshUrl.replace("/cortexfiles-", "/cortexfiles-local-"),
    ])("never fetches a renewed URL for a different blob: %s", async (url) => {
        fetchShortLivedUrl.mockResolvedValue({ url });
        expect((await GET(request())).status).toBe(502);
        expect(fetchAllowedBlobUrl).toHaveBeenCalledTimes(1);
    });

    it("keeps downloads private and uncached", async () => {
        const response = await GET(request(staleUrl, { download: "1" }));
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    it("does not look up provenance or refresh a working signed URL", async () => {
        fetchAllowedBlobUrl
            .mockReset()
            .mockResolvedValue(new Response("cover"));
        expect((await GET(request())).status).toBe(200);
        expect(validateAppletAccess).not.toHaveBeenCalled();
        expect(fetchShortLivedUrl).not.toHaveBeenCalled();
    });
});

describe("cover URL identity", () => {
    it("recognizes token rotation without equating different containers or paths", () => {
        expect(isSameCoverBlob(staleUrl, freshUrl)).toBe(true);
        expect(
            isSameCoverBlob(staleUrl, freshUrl.replace("123abc", "other")),
        ).toBe(false);
        expect(
            isSameCoverBlob(
                staleUrl,
                freshUrl.replace("owner-context", "other"),
            ),
        ).toBe(false);
        expect(isSameCoverBlob(null, null)).toBe(false);
    });

    it("recognizes Azure and local legacy cover paths, leaving unrelated media alone", () => {
        expect(isGeneratedAppletCoverUrl(staleUrl)).toBe(true);
        expect(
            isGeneratedAppletCoverUrl(
                staleUrl.replace("applets/assets", "assets"),
            ),
        ).toBe(true);
        expect(
            isGeneratedAppletCoverUrl(
                staleUrl.replace(
                    origin,
                    "http://localhost:10000/devstoreaccount1",
                ),
            ),
        ).toBe(true);
        expect(
            isGeneratedAppletCoverUrl(
                staleUrl.replace(origin, "https://unrelated.example"),
            ),
        ).toBe(false);
        expect(
            isGeneratedAppletCoverUrl(
                staleUrl.replace("card-art-dark-123abc.png", "notes.html"),
            ),
        ).toBe(false);
        expect(isGeneratedAppletCoverUrl("not a URL")).toBe(false);
    });
});
