/** @jest-environment node */
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { GET } from "../image-proxy/route";
import { getCurrentUser } from "../utils/auth.js";
import Applet from "../models/applet";
import Share from "../models/share.js";
import App from "../models/app";
import MediaItem from "../models/media-item.mjs";
import User from "../models/user";
import Workspace from "../models/workspace.js";
import { fetchShortLivedUrl } from "../utils/llm-file-utils.js";
import { resolveAuthorizedMediaRouting } from "../utils/file-route-utils.js";

jest.mock("../utils/auth.js", () => ({ getCurrentUser: jest.fn() }));
jest.mock("../models/app", () => ({
    __esModule: true,
    default: { find: jest.fn(), findOne: jest.fn() },
    APP_TYPES: { APPLET: "applet" },
    APP_STATUS: { ACTIVE: "active" },
}));
jest.mock("../models/media-item.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));
jest.mock("../models/user", () => ({
    __esModule: true,
    default: { find: jest.fn(), findOne: jest.fn() },
}));
jest.mock("../models/workspace.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));
jest.mock("../models/applet.js", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../models/share.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
    SHARE_ENTITY_TYPES: ["applet", "published_applet", "workspace"],
}));
jest.mock("../utils/file-resolution-utils.js", () => ({
    resolveAndHealFile: jest.fn(),
}));

const appletId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const blobPath = `applets/assets/${appletId}/card-art-dark-123abc.png`;
const origin = "https://examplefiles.blob.core.windows.net";
const staleUrl = `${origin}/cortexfiles-owner-context/${blobPath}?sig=expired`;
const freshUrl = staleUrl.replace("expired", "fresh");
const viewer = { _id: "viewer", contextId: "viewer-context" };
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
});
const previous = {};
const originalFetch = global.fetch;
const query = (value) => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
});
const request = (url = staleUrl, hints = {}) =>
    new Request(
        `http://localhost/api/image-proxy?${new URLSearchParams({ ...(url ? { url } : {}), ...hints })}`,
    );
const grants = () =>
    global.fetch.mock.calls.filter(
        ([url]) => new URL(url).hostname === "cfh.invalid",
    );
const claims = () =>
    jwt.verify(
        new Headers(grants()[0][1].headers).get("x-cfh-grant"),
        publicKey,
        {
            algorithms: ["RS256"],
            issuer: "concierge-test",
            audience: "cfh-test",
        },
    );

beforeAll(() => {
    for (const [key, value] of Object.entries({
        CFH_GRANT_PRIVATE_KEY: privateKey.export({
            type: "pkcs8",
            format: "pem",
        }),
        CFH_GRANT_KEY_ID: "test",
        CFH_GRANT_ISSUER: "concierge-test",
        CFH_GRANT_AUDIENCE: "cfh-test",
        CORTEX_MEDIA_API_URL: "https://cfh.invalid/api",
    })) {
        previous[key] = process.env[key];
        process.env[key] = value;
    }
});
afterAll(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});
beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue(viewer);
    Applet.findById.mockReturnValue(
        query({ _id: appletId, owner: "owner", version: 2 }),
    );
    App.findOne.mockReturnValue(query(null));
    Share.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
            recipients: [{ userId: viewer._id, role: "viewer" }],
        }),
    });
    App.find.mockReturnValue(query([{ imageDarkUrl: staleUrl }]));
    MediaItem.find.mockReturnValue(query([]));
    User.find.mockReturnValue(
        query([{ _id: "owner", contextId: "owner-context" }]),
    );
    User.findOne.mockReturnValue(query(null));
    Workspace.findOne.mockReturnValue({
        select: () =>
            Object.assign(Promise.resolve(null), {
                lean: () => Promise.resolve(null),
            }),
    });
    global.fetch = jest.fn(async (url) => {
        if (new URL(url).hostname === "cfh.invalid")
            return Response.json({ shortLivedUrl: freshUrl });
        return String(url) === staleUrl
            ? new Response("", { status: 403 })
            : new Response("image bytes", {
                  headers: { "content-type": "image/png" },
              });
    });
});

test("an accessible cover renews through the real grant signer with exactly one read target", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image bytes");
    expect(claims()).toMatchObject({
        sub: viewer.contextId,
        processFiles: false,
        targets: [
            { owner: "owner-context", path: blobPath, actions: ["read"] },
        ],
    });
    expect(new URL(grants()[0][0]).searchParams.get("contextId")).toBe(
        "owner-context",
    );
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
});
test("caller hints cannot change the authorized cover or owner", async () => {
    expect(
        (
            await GET(
                request(staleUrl, {
                    contextId: "victim",
                    blobPath: "profile/private.png",
                    fileScope: "profile",
                }),
            )
        ).status,
    ).toBe(200);
    expect(claims().targets).toEqual([
        { owner: "owner-context", path: blobPath, actions: ["read"] },
    ]);
    expect(User.findOne).not.toHaveBeenCalled();
});
test("inaccessible apps never receive a grant", async () => {
    Share.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    expect((await GET(request())).status).toBe(403);
    expect(grants()).toHaveLength(0);
});
test("an unsaved neighboring image never receives a grant", async () => {
    expect(
        (await GET(request(staleUrl.replace("123abc", "other")))).status,
    ).toBe(200); // valid signed URLs remain readable
    global.fetch.mockImplementation(async (url) =>
        new URL(url).hostname === "cfh.invalid"
            ? Response.json({ shortLivedUrl: freshUrl })
            : new Response("", { status: 403 }),
    );
    expect(
        (await GET(request(staleUrl.replace("123abc", "other")))).status,
    ).toBe(404);
    expect(grants()).toHaveLength(0);
});
test("a grant for a saved cover cannot cause a different returned blob to be fetched", async () => {
    global.fetch.mockImplementation(async (url) =>
        new URL(url).hostname === "cfh.invalid"
            ? Response.json({
                  shortLivedUrl: freshUrl.replace("123abc", "private"),
              })
            : new Response("", { status: 403 }),
    );
    expect((await GET(request())).status).toBe(502);
    expect(global.fetch).toHaveBeenCalledTimes(2);
});

describe("shared profile photos", () => {
    const avatarPath = "profile/avatar.jpg";
    const avatarUrl = `${origin}/cortexfiles-owner-context/${avatarPath}?sig=expired`;
    beforeEach(() => {
        User.findOne.mockReturnValue(
            query({
                contextId: "owner-context",
                username: "owner@example.com",
                profilePicture: avatarUrl,
                profilePictureBlobPath: avatarPath,
            }),
        );
        global.fetch.mockImplementation(async (url) =>
            new URL(url).hostname === "cfh.invalid"
                ? Response.json({
                      shortLivedUrl: avatarUrl.replace("expired", "fresh"),
                  })
                : new Response("avatar", {
                      headers: { "content-type": "image/jpeg" },
                  }),
        );
    });
    test.each(["url", "path"])(
        "renews only the saved profile photo via %s",
        async (format) => {
            const response = await GET(
                format === "url"
                    ? request(avatarUrl)
                    : request(null, {
                          blobPath: avatarPath,
                          contextId: "owner-context",
                          fileScope: "profile",
                      }),
            );
            expect(response.status).toBe(200);
            expect(claims().targets).toEqual([
                { owner: "owner-context", path: avatarPath, actions: ["read"] },
            ]);
            expect(response.headers.get("cache-control")).toBe(
                "private, max-age=300",
            );
        },
    );
    test("rejects arbitrary neighboring profile files", async () => {
        expect(
            (await GET(request(avatarUrl.replace("avatar.jpg", "private.jpg"))))
                .status,
        ).toBe(404);
        expect(grants()).toHaveLength(0);
    });
    test("rejects a returned URL for another user's file", async () => {
        global.fetch.mockResolvedValue(
            Response.json({
                shortLivedUrl: avatarUrl.replace("owner-context", "victim"),
            }),
        );
        expect((await GET(request(avatarUrl))).status).toBe(502);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

describe("context-only URL renewal", () => {
    test("renews the owner's legacy workspace file without mistaking it for another user", async () => {
        Workspace.findOne.mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: "legacy-workspace" }),
        });
        expect(
            await fetchShortLivedUrl({
                blobPath: "report.csv",
                contextId: "legacy-workspace",
            }),
        ).not.toBeNull();
        expect(Workspace.findOne).toHaveBeenCalledWith({
            _id: "legacy-workspace",
            owner: viewer._id,
        });
        expect(claims().targets).toEqual([
            { owner: "legacy-workspace", prefix: "", actions: ["read"] },
        ]);
    });
    test("does not renew another user's workspace file", async () => {
        expect(
            await fetchShortLivedUrl({
                blobPath: "report.csv",
                contextId: "other-context",
            }),
        ).toBeNull();
        expect(grants()).toHaveLength(0);
    });
    test("renews an accessible shared applet file from its canonical context", async () => {
        expect(
            await fetchShortLivedUrl({
                blobPath: "applet-shared/data.csv",
                contextId: `applet-shared:${appletId}`,
            }),
        ).not.toBeNull();
        expect(claims().targets).toEqual([
            {
                owner: `applet-shared:${appletId}`,
                prefix: "applet-shared/",
                actions: ["read"],
            },
        ]);
    });
    test("rejects canonical shared contexts without applet access", async () => {
        Share.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        expect(
            await fetchShortLivedUrl({
                blobPath: "applet-shared/data.csv",
                contextId: `applet-shared:${appletId}`,
            }),
        ).toBeNull();
        expect(grants()).toHaveLength(0);
    });
    test("does not let a shared-app viewer read a different user's private applet files", async () => {
        expect(
            await fetchShortLivedUrl({
                blobPath: `applets/${appletId}/private.csv`,
                contextId: `applet-user:${appletId}:other-context`,
            }),
        ).toBeNull();
        expect(grants()).toHaveLength(0);
    });
});

describe("share permissions through image renewal and signing", () => {
    test.each(["viewer", "editor"])(
        "an explicit %s recipient gets only a cover read grant",
        async (role) => {
            Share.findOne.mockReturnValue({
                lean: async () => ({
                    recipients: [{ userId: viewer._id, role }],
                }),
            });
            expect((await GET(request())).status).toBe(200);
            expect(claims().targets).toEqual([
                { owner: "owner-context", path: blobPath, actions: ["read"] },
            ]);
        },
    );
    test("an enabled applet share link can renew its cover", async () => {
        Share.findOne.mockReturnValue({
            lean: async () => ({
                recipients: [],
                link: { enabled: true, role: "viewer" },
            }),
        });
        expect((await GET(request())).status).toBe(200);
    });
    test("a published-only recipient can renew an unlisted applet cover", async () => {
        Applet.findById.mockReturnValue(
            query({
                _id: appletId,
                owner: "owner",
                version: 2,
                publishedVersionIndex: 0,
            }),
        );
        Share.findOne.mockImplementation(({ entityType }) => ({
            lean: async () =>
                entityType === "published_applet"
                    ? { recipients: [{ userId: viewer._id, role: "viewer" }] }
                    : null,
        }));
        expect((await GET(request())).status).toBe(200);
    });
    test("a listed published applet cover works without a direct share", async () => {
        Applet.findById.mockReturnValue(
            query({
                _id: appletId,
                owner: "owner",
                version: 2,
                publishedVersionIndex: 0,
            }),
        );
        Share.findOne.mockReturnValue({ lean: async () => null });
        App.findOne.mockReturnValue(query({ _id: "listed-app" }));
        expect((await GET(request())).status).toBe(200);
    });
    test.each([undefined, 0])(
        "revoked access cannot renew an unlisted applet cover (published=%s)",
        async (publishedVersionIndex) => {
            Applet.findById.mockReturnValue(
                query({
                    _id: appletId,
                    owner: "owner",
                    version: 2,
                    publishedVersionIndex,
                }),
            );
            Share.findOne.mockReturnValue({
                lean: async () => ({
                    recipients: [],
                    link: { enabled: false },
                }),
            });
            expect((await GET(request())).status).toBe(403);
            expect(grants()).toHaveLength(0);
        },
    );
    test("a workspace recipient can renew shared files but cannot write them", async () => {
        const workspaceId = "bbbbbbbbbbbbbbbbbbbbbbbb";
        Workspace.findOne.mockImplementation((filter) => ({
            select: () =>
                Object.assign(Promise.resolve(null), {
                    lean: async () =>
                        filter.owner
                            ? null
                            : { _id: workspaceId, owner: "owner" },
                }),
        }));
        expect(
            await fetchShortLivedUrl({
                blobPath: "report.csv",
                contextId: workspaceId,
            }),
        ).not.toBeNull();
        expect(claims().targets).toEqual([
            { owner: workspaceId, prefix: "", actions: ["read"] },
        ]);
        await expect(
            resolveAuthorizedMediaRouting({
                user: viewer,
                action: "upload",
                routingInput: { contextId: workspaceId },
            }),
        ).rejects.toMatchObject({ status: 403 });
        Share.findOne.mockReturnValue({ lean: async () => null });
        global.fetch.mockClear();
        expect(
            await fetchShortLivedUrl({
                blobPath: "report.csv",
                contextId: workspaceId,
            }),
        ).toBeNull();
        expect(grants()).toHaveLength(0);
    });
});
