/** @jest-environment node */
import { POST, DELETE } from "./route";
import {
    purgeFiles,
    deleteFileFromCloud,
} from "../../../workspaces/[id]/components/chatFileUtils";

jest.mock("../../utils/auth.js", () => ({
    getCurrentUser: jest.fn(async () => ({ _id: "user", contextId: "ctx" })),
}));
jest.mock("../../models/workspace.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn(() => ({ select: async () => null })) },
}));
jest.mock("../../../../config/index.js", () => ({
    __esModule: true,
    default: { endpoints: { mediaHelperDirect: () => "https://cfh.test/api" } },
}));

const t = (key) => key;
const file = (blobPath, extra = {}) => ({ type: "file", blobPath, ...extra });
let upstream;
let active;
let maxActive;
beforeEach(() => {
    global.window = { location: { origin: "http://localhost" } };
    upstream = [];
    active = 0;
    maxActive = 0;
    global.fetch = jest.fn(async (url, options) => {
        if (String(url).includes("cfh.test")) {
            upstream.push({ url: new URL(url), options });
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setImmediate(resolve));
            active--;
            const paths = JSON.parse(options.body).blobPaths;
            return Response.json({
                results: paths.map((blobPath) => ({
                    blobPath,
                    deleted: !blobPath.endsWith("fail.txt"),
                    status: blobPath.endsWith("fail.txt") ? 500 : 200,
                })),
            });
        }
        if (options.method === "POST")
            return POST({ json: async () => JSON.parse(options.body) });
        return DELETE({ url: String(url) });
    });
});

test("browser through real API authorization sends chat and global locations in their own scopes", async () => {
    const files = [file("chats/chat-1/32.jpg"), file("global/report.txt")];
    const result = await purgeFiles({
        fileObjs: files,
        contextId: "ctx",
        chatId: "wrong-active-chat",
        t,
    });
    expect(result.cloudDeleted).toBe(2);
    expect(upstream).toHaveLength(2);
    expect(upstream[0].url.searchParams.get("fileScope")).toBe("chat");
    expect(upstream[0].url.searchParams.get("chatId")).toBe("chat-1");
    expect(upstream[1].url.searchParams.get("fileScope")).toBe("global");
    expect(upstream[1].url.searchParams.has("chatId")).toBe(false);
});

test("bulk deletion bounds request size and concurrency across browser and handler", async () => {
    const files = Array.from({ length: 1001 }, (_, i) =>
        file(`global/${i}.txt`),
    );
    const result = await purgeFiles({ fileObjs: files, contextId: "ctx", t });
    expect(result.cloudDeleted).toBe(1001);
    expect(
        upstream.map((call) => JSON.parse(call.options.body).blobPaths.length),
    ).toEqual([500, 500, 1]);
    expect(maxActive).toBe(1);
});

test("partial failure throws accurate results and only replaces confirmed message attachments", async () => {
    const files = [
        file("chats/a/good.txt", { hash: "same-legacy-hash" }),
        file("chats/a/fail.txt", { hash: "same-legacy-hash" }),
    ];
    const hook = { mutateAsync: jest.fn(async () => ({})) };
    const promise = purgeFiles({
        fileObjs: files,
        contextId: "ctx",
        chatId: "a",
        t,
        messages: [
            { id: "message", payload: files.map((f) => JSON.stringify(f)) },
        ],
        updateChatHook: hook,
    });
    await expect(promise).rejects.toMatchObject({
        results: {
            cloudDeleted: 1,
            deletedFiles: [files[0]],
            failedFiles: [files[1]],
        },
    });
    const payload =
        hook.mutateAsync.mock.calls[0][0].messageUpdates[0].payload.map(
            (value) => JSON.parse(value),
        );
    expect(payload[0].isDeletedFile).toBe(true);
    expect(payload[1]).toEqual(files[1]);
});

test("authorization failure rejects the whole batch before any upstream mutation", async () => {
    await expect(
        purgeFiles({
            fileObjs: [
                file("global/a.txt"),
                file("global/b.txt", { contextId: "foreign" }),
            ],
            contextId: "ctx",
            t,
        }),
    ).rejects.toMatchObject({ results: { cloudDeleted: 0 } });
    expect(upstream).toHaveLength(0);
});

test("missing or failed upstream results cannot be reported as deletions", async () => {
    global.fetch = jest.fn(async () => Response.json({ results: [] }));
    await expect(
        purgeFiles({ fileObjs: [file("global/a.txt")], contextId: "ctx", t }),
    ).rejects.toMatchObject({ results: { cloudDeleted: 0 } });
});

test("single path deletion infers article scope and propagates failures", async () => {
    global.fetch = jest.fn(async () => new Response("", { status: 403 }));
    await expect(
        deleteFileFromCloud({ blobPath: "articles/a.md", contextId: "ctx" }),
    ).rejects.toThrow("403");
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.searchParams.get("fileScope")).toBe("articles");
});

test("custom user folders retain their exact paths without falling back to global", async () => {
    const result = await purgeFiles({
        fileObjs: [file("custom/photos/picture.jpg")],
        contextId: "ctx",
        t,
    });
    expect(result.cloudDeleted).toBe(1);
    expect(upstream[0].url.searchParams.get("contextId")).toBe("ctx");
    expect(upstream[0].url.searchParams.get("fileScope")).toBe("all");
    expect(JSON.parse(upstream[0].options.body).blobPaths).toEqual([
        "custom/photos/picture.jpg",
    ]);
});
