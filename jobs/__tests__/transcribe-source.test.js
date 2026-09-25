jest.mock("@apollo/client/index.js", () => ({
    __esModule: true,
    gql: (strings, ...values) => ({ strings, values }),
}));
jest.mock("../../app/api/models/user.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../../app/api/models/user-state.mjs", () => ({
    __esModule: true,
    default: {},
}));
jest.mock("../../app/api/models/task.mjs", () => ({
    __esModule: true,
    default: {},
}));
jest.mock("../../app/api/models/chat.mjs", () => ({
    __esModule: true,
    default: { exists: jest.fn() },
}));
jest.mock("../../app/api/models/applet-file.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));
jest.mock("../../app/api/applet/access.js", () => ({
    validateAppletAccess: jest.fn(),
}));
jest.mock("../../app/api/utils/publicMediaUrlValidation.js", () => ({
    validatePublicMediaUrl: jest.fn(async (url) => ({ ok: true, url })),
}));

const {
    refreshTranscriptionSource,
} = require("../tasks/transcribe-source.mjs");
const {
    getTranscriptionSourceIdentity,
} = require("../../src/utils/transcriptionSource.js");
const {
    shouldApplyTranscriptionToState,
} = require("../tasks/transcribe-state.mjs");
const User = require("../../app/api/models/user.mjs").default;
const Chat = require("../../app/api/models/chat.mjs").default;
const AppletFile = require("../../app/api/models/applet-file.js").default;
const { validateAppletAccess } = require("../../app/api/applet/access.js");
const base =
    "https://examplefiles.blob.core.windows.net/owner/global/Example-Clip-10s.mp4";
const originalFetch = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({ contextId: "owner-context" }),
        }),
    });
});
afterAll(() => {
    global.fetch = originalFetch;
});

function found(url) {
    return { ok: true, json: async () => ({ url, shortLivedUrl: url }) };
}

test("renews media and owned chat files without widening their scope", async () => {
    const chatId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    Chat.exists.mockResolvedValue({ _id: chatId });
    for (const [path, scope] of [
        ["media/video.mp4", "media"],
        [`chats/${chatId}/video.mp4`, "chat"],
    ]) {
        const url = `https://examplefiles.blob.core.windows.net/owner/${path}`;
        global.fetch.mockResolvedValue(found(url));
        await refreshTranscriptionSource(url, "owner-context", {
            userId: "user",
        });
        expect(
            new URL(global.fetch.mock.calls.at(-1)[0]).searchParams.get(
                "fileScope",
            ),
        ).toBe(scope);
    }
    expect(Chat.exists).toHaveBeenCalledWith({ _id: chatId, userId: "user" });
});

test.each([true, false])(
    "revalidates applet file membership, including legacy queued tasks (descriptor=%s)",
    async (hasDescriptor) => {
        const appletId = "aaaaaaaaaaaaaaaaaaaaaaaa";
        const fileId = "bbbbbbbbbbbbbbbbbbbbbbbb";
        const url = `https://examplefiles.blob.core.windows.net/owner/applets/${appletId}/video.mp4`;
        validateAppletAccess.mockResolvedValue(null);
        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [{ _id: fileId, owner: "user", url }],
            }),
        });
        global.fetch.mockResolvedValue(found(`${url}?sig=renewed`));
        const authorization = {
            userId: "user",
            ...(hasDescriptor && { sourceFile: { appletId, fileId } }),
        };
        expect(
            await refreshTranscriptionSource(
                url,
                "owner-context",
                authorization,
            ),
        ).toBe(`${url}?sig=renewed`);
        const query = new URL(global.fetch.mock.calls[0][0]).searchParams;
        expect(query.get("fileScope")).toBe("applet-user");
        expect(query.get("appletId")).toBe(appletId);
        expect(AppletFile.findOne).toHaveBeenCalledWith({
            appletId,
            userId: "user",
        });
        validateAppletAccess.mockResolvedValue({ status: 403 });
        global.fetch.mockClear();
        await expect(
            refreshTranscriptionSource(url, "owner-context", authorization),
        ).rejects.toThrow("authorize");
        expect(global.fetch).not.toHaveBeenCalled();
    },
);

test("rejects cross-owner chat and applet files before asking storage for access", async () => {
    const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
    Chat.exists.mockResolvedValue(null);
    validateAppletAccess.mockResolvedValue(null);
    AppletFile.findOne.mockReturnValue({
        populate: jest
            .fn()
            .mockResolvedValue({ files: [{ owner: "other", url: `${base}` }] }),
    });
    for (const scope of ["chats", "applets", "unknown"]) {
        await expect(
            refreshTranscriptionSource(
                `https://examplefiles.blob.core.windows.net/owner/${scope}/${id}/video.mp4`,
                "owner-context",
                { userId: "user" },
            ),
        ).rejects.toThrow("authorize");
    }
    expect(global.fetch).not.toHaveBeenCalled();
});

test("renews the same saved blob using owner-scoped lookup on every attempt", async () => {
    global.fetch
        .mockResolvedValueOnce(found(`${base}?sig=first`))
        .mockResolvedValueOnce(found(`${base}?sig=second`));
    expect(
        await refreshTranscriptionSource(
            `${base}?sig=expired`,
            "owner-context",
        ),
    ).toBe(`${base}?sig=first`);
    expect(
        await refreshTranscriptionSource(
            `${base}?sig=expired`,
            "owner-context",
        ),
    ).toBe(`${base}?sig=second`);
    const [url, options] = global.fetch.mock.calls[0];
    expect(Object.fromEntries(new URL(url).searchParams)).toMatchObject({
        blobPath: "global/Example-Clip-10s.mp4",
        contextId: "owner-context",
        userId: "owner-context",
        fileScope: "global",
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(global.fetch).toHaveBeenCalledTimes(2);
});

test.each([
    null,
    base.replace("/owner/", "/someone-else/"),
    base.replace("10s.mp4", "other.mp4"),
])(
    "never substitutes a missing, cross-owner or different file: %s",
    async (renewed) => {
        global.fetch.mockResolvedValue(
            renewed ? found(renewed) : { ok: false, status: 404 },
        );
        await expect(
            refreshTranscriptionSource(`${base}?sig=expired`, "owner-context"),
        ).rejects.toThrow("Unable to access saved media");
    },
);

test("does not look up external media or renew without an owner", async () => {
    const external = "https://cdn.example.com/video?id=123&sig=keep";
    expect(await refreshTranscriptionSource(external, "owner-context")).toBe(
        external,
    );
    await expect(refreshTranscriptionSource(base)).rejects.toThrow(
        "Unable to renew",
    );
    expect(global.fetch).not.toHaveBeenCalled();
});

test("SAS renewal preserves identity, while versions and external queries identify different media", () => {
    expect(getTranscriptionSourceIdentity(`${base}?sig=old&se=old`)).toBe(
        getTranscriptionSourceIdentity(`${base}?sig=new&se=new`),
    );
    expect(
        getTranscriptionSourceIdentity(`${base}?versionid=1&sig=old`),
    ).not.toBe(getTranscriptionSourceIdentity(`${base}?versionid=2&sig=new`));
    expect(getTranscriptionSourceIdentity(`${base}?snapshot=one`)).not.toBe(
        getTranscriptionSourceIdentity(base),
    );
    expect(
        getTranscriptionSourceIdentity("https://cdn.example.com/video?id=1"),
    ).not.toBe(
        getTranscriptionSourceIdentity("https://cdn.example.com/video?id=2"),
    );
});

test("immutable versions are not silently replaced with current blobs", async () => {
    await expect(
        refreshTranscriptionSource(`${base}?versionid=1`, "owner-context"),
    ).rejects.toThrow("Unable to renew");
    expect(global.fetch).not.toHaveBeenCalled();
});

test("completion accepts renewed SAS but refuses a different saved file", () => {
    const state = {
        transcribe: { videoInformation: { videoUrl: `${base}?sig=new` } },
    };
    expect(
        shouldApplyTranscriptionToState(
            { url: `${base}?sig=old` },
            state.transcribe,
        ),
    ).toBe(true);
    expect(
        shouldApplyTranscriptionToState(
            { url: base.replace("10s.mp4", "20s.mp4") },
            state.transcribe,
        ),
    ).toBe(false);
});

test("queue worker binds renewal to job owner, preserves metadata, and sends fresh access", async () => {
    const handler = (await import("../tasks/transcribe.mjs")).default;
    global.fetch.mockResolvedValue(found(`${base}?sig=fresh`));
    const metadata = {
        url: `${base}?sig=expired`,
        contextId: "forged-context",
        modelOption: "Whisper",
    };
    const job = {
        data: { userId: "queue-owner", taskId: "task", metadata },
        client: {
            query: jest.fn().mockResolvedValue({
                data: { transcribe: { result: "request-id" } },
            }),
        },
    };
    expect(await handler.startRequest(job)).toBe("request-id");
    expect(User.findById).toHaveBeenCalledWith("queue-owner");
    expect(job.client.query.mock.calls[0][0].variables).toMatchObject({
        file: `${base}?sig=fresh`,
        contextId: "owner-context",
    });
    expect(metadata).toEqual({
        url: `${base}?sig=expired`,
        contextId: "forged-context",
        modelOption: "Whisper",
    });
});

test("public-only requests do not gain owner storage access", async () => {
    const handler = (await import("../tasks/transcribe.mjs")).default;
    const job = {
        data: {
            userId: "queue-owner",
            metadata: { url: base, enforcePublicUrl: true },
        },
        client: {
            query: jest.fn().mockResolvedValue({
                data: { transcribe: { result: "request-id" } },
            }),
        },
    };
    await handler.startRequest(job);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(User.findById).not.toHaveBeenCalled();
});
