/** @jest-environment node */
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "node:crypto";
import { signStorageGrant, withStoragePrincipal } from "../storage-grants.mjs";
import { authorizedMediaFetch } from "../cfh-client.mjs";
import { grantForCortexRun } from "../cortex-grants.mjs";
import { resolveAuthorizedMediaRouting } from "../file-route-utils.js";
import { listColleagues, requireColleague } from "../colleagues.js";
import Workspace from "../../models/workspace.js";
import Applet from "../../models/applet.js";
jest.mock("../colleagues.js", () => ({
    listColleagues: jest.fn(async () => []),
    requireColleague: jest.fn(),
}));

jest.mock("../../models/workspace.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));
jest.mock("../../models/applet.js", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../../applet/access.js", () => ({
    validateAppletAccess: jest.fn(async () => ({ status: 403 })),
}));
jest.mock("../shareAccess.js", () => ({
    resolveShareAccess: jest.fn(async () => ({ canAccess: false })),
}));

const user = {
    _id: "user-a",
    contextId: "alice",
    contextKey: "must-not-appear-in-grant",
};
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
});
const previous = {};
beforeAll(() => {
    for (const [key, value] of Object.entries({
        CFH_GRANT_PRIVATE_KEY: privateKey.export({
            type: "pkcs8",
            format: "pem",
        }),
        CORTEX_MEDIA_API_URL: "https://cfh.invalid/api",
        CFH_GRANT_KEY_ID: "test",
        CFH_GRANT_ISSUER: "concierge-test",
        CFH_GRANT_AUDIENCE: "cfh-test",
    })) {
        previous[key] = process.env[key];
        process.env[key] = value;
    }
});
afterAll(() => {
    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});
beforeEach(() => {
    jest.clearAllMocks();
    listColleagues.mockResolvedValue([]);
    requireColleague.mockRejectedValue(
        Object.assign(new Error("Colleague not found"), { status: 404 }),
    );
    Workspace.findOne.mockReturnValue({ select: async () => null });
    Applet.findById.mockReturnValue({
        select: () => ({ lean: async () => null }),
    });
    global.fetch = jest.fn(async () => Response.json({ ok: true }));
});
const decode = (token) =>
    jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: "concierge-test",
        audience: "cfh-test",
    });

test("signed run preserves chat write and user-wide read without including encryption keys", async () => {
    const token = await grantForCortexRun(user, {
        fileAccessPlan: [
            {
                kind: "chat",
                userContextId: "alice",
                chatId: "a",
                write: true,
                contextKey: user.contextKey,
            },
            {
                kind: "user-files",
                userContextId: "alice",
                contextKey: user.contextKey,
            },
        ],
    });
    const claims = decode(token);
    expect(claims.targets[0]).toMatchObject({
        owner: "alice",
        prefix: "chats/a/",
        actions: expect.arrayContaining(["delete"]),
    });
    expect(claims.targets[1]).toEqual({
        owner: "alice",
        prefix: "",
        actions: ["read", "list"],
    });
    expect(JSON.stringify(claims)).not.toContain(user.contextKey);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(3600);
});

test.each([
    {
        contextId: "alice",
        workspaceId: "foreign",
        fileScope: "workspace-shared-legacy",
    },
    {
        contextId: "foreign",
        workspaceId: "foreign",
        fileScope: "workspace-shared-legacy",
    },
    {
        contextId: "alice",
        workspaceId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        fileScope: "applet-shared",
    },
    { userId: "bob", fileScope: "global" },
])("foreign or conflicting routing is denied: %j", async (routingInput) => {
    await expect(
        resolveAuthorizedMediaRouting({ user, routingInput, action: "delete" }),
    ).rejects.toMatchObject({ status: 403 });
});

test("multipart upload gets a scope checked against the bound worker principal", async () => {
    const body = new FormData();
    body.set("contextId", "alice");
    body.set("userId", "alice");
    body.set("chatId", "a");
    body.set("fileScope", "chat");
    body.set("file", new Blob(["test"]), "test.txt");
    await withStoragePrincipal(user, () =>
        authorizedMediaFetch("https://cfh.invalid/api", {
            method: "POST",
            body,
        }),
    );
    const [, options] = global.fetch.mock.calls[0];
    expect(decode(options.headers.get("x-cfh-grant")).targets).toEqual([
        { owner: "alice", prefix: "chats/a/", actions: ["upload"] },
    ]);
    expect(options.redirect).toBe("manual");
});

test("a body override cannot trick the signer into authorizing a foreign workspace", async () => {
    await expect(
        withStoragePrincipal(user, () =>
            authorizedMediaFetch("https://cfh.invalid/api?contextId=alice", {
                method: "DELETE",
                body: JSON.stringify({
                    contextId: "alice",
                    workspaceId: "foreign",
                    fileScope: "workspace-shared-legacy",
                    blobPaths: ["a.txt"],
                }),
            }),
        ),
    ).rejects.toMatchObject({ status: 403 });
    expect(global.fetch).not.toHaveBeenCalled();
});

test("foreign plans and attached contexts cannot be signed", async () => {
    await expect(
        grantForCortexRun(user, {
            fileAccessPlan: [{ kind: "user-files", userContextId: "bob" }],
        }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
        grantForCortexRun(user, {
            agentContext: "applet-shared:aaaaaaaaaaaaaaaaaaaaaaaa",
        }),
    ).rejects.toMatchObject({ status: 403 });
    expect(() =>
        signStorageGrant(user, [
            { owner: "alice", prefix: "../", actions: ["read"] },
        ]),
    ).toThrow();
});

test("assistant materials accompany a run as read-only scopes beside applet files", async () => {
    const materialId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const appletId = "cccccccccccccccccccccccc";
    const assistants = [
        {
            id: "specialist",
            status: "active",
            editable: false,
            materialsContext: `applet-shared:${materialId}`,
            agentContext: `applet-shared:${materialId}`,
        },
        {
            id: "fixture-applet",
            status: "active",
            materialsContext: `applet-shared:${appletId}`,
        },
    ];
    requireColleague.mockResolvedValue(assistants[0]);
    listColleagues.mockImplementation(async (_user, { materialsContext }) =>
        assistants.filter(
            (assistant) => assistant.materialsContext === materialsContext,
        ),
    );
    const claims = decode(
        await grantForCortexRun(user, {
            entityId: "specialist",
            agentContext: `applet-shared:${appletId}`,
            fileAccessPlan: [
                { kind: "user-global", userContextId: "alice", write: true },
            ],
        }),
    );
    expect(claims.sub).toBe("alice");
    expect(requireColleague).toHaveBeenCalledWith(user, "specialist");
    for (const id of [materialId, appletId]) {
        expect(listColleagues).toHaveBeenCalledWith(user, {
            materialsContext: `applet-shared:${id}`,
            limit: 1,
        });
    }
    expect(claims.targets).toEqual(
        expect.arrayContaining([
            {
                owner: `applet-shared:${materialId}`,
                prefix: "applet-shared/",
                actions: ["read", "list"],
            },
            {
                owner: `applet-shared:${appletId}`,
                prefix: "applet-shared/",
                actions: ["read", "list"],
            },
        ]),
    );
    expect(claims.targets.every((target) => target.owner !== "author")).toBe(
        true,
    );
});

test("material ACL grants viewer reads, author writes, and denies revoked or archived access", async () => {
    const appletId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const assistant = {
        id: "specialist",
        status: "active",
        editable: false,
        materialsContext: `applet-shared:${appletId}`,
    };
    const route = (action) =>
        resolveAuthorizedMediaRouting({
            user,
            action,
            routingInput: { appletId, fileScope: "applet-shared" },
        });
    listColleagues.mockResolvedValue([assistant]);
    await expect(route("read")).resolves.toBeDefined();
    await expect(route("upload")).rejects.toMatchObject({ status: 403 });
    listColleagues.mockResolvedValue([{ ...assistant, editable: true }]);
    await expect(route("upload")).resolves.toBeDefined();
    // The directory query excludes archived or revoked material access.
    listColleagues.mockResolvedValue([]);
    await expect(route("read")).rejects.toMatchObject({ status: 403 });
    expect(listColleagues).toHaveBeenLastCalledWith(user, {
        materialsContext: `applet-shared:${appletId}`,
        limit: 1,
    });
});
