/** @jest-environment node */
import { GET, POST, DELETE } from "../[id]/materials/route.js";
import { PUT as share } from "../[id]/sharing/route.js";
import { POST as draft } from "../draft/route.js";
import { getCurrentUser } from "../../utils/auth";
import { requireColleague, colleagueRequest } from "../../utils/colleagues.js";
import { parseStreamingMultipart } from "../../utils/upload-utils";
import {
    listMediaFiles,
    uploadBufferToMediaService,
    deleteMediaFile,
} from "../../utils/media-service-utils";
import User from "../../models/user.mjs";
jest.mock("../../utils/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("../../utils/colleagues.js", () => ({
    requireColleague: jest.fn(),
    colleagueRequest: jest.fn(),
}));
jest.mock("../../utils/upload-utils", () => ({
    parseStreamingMultipart: jest.fn(),
}));
jest.mock("../../utils/media-service-utils", () => ({
    listMediaFiles: jest.fn(),
    uploadBufferToMediaService: jest.fn(),
    deleteMediaFile: jest.fn(),
    hashBuffer: jest.fn(async () => "hash"),
}));
jest.mock("../../models/user.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));
const context = { params: Promise.resolve({ id: "specialist" }) };
const assistant = {
    id: "specialist",
    kind: "colleague",
    editable: true,
    isOwner: true,
    materialsContext: "applet-shared:bbbbbbbbbbbbbbbbbbbbbbbb",
};
const request = (path) =>
    new Request(
        `http://localhost/api/colleagues/specialist/materials?path=${encodeURIComponent(path)}`,
    );
beforeEach(() => {
    jest.resetAllMocks();
    getCurrentUser.mockResolvedValue({ _id: "user-a", contextId: "alice" });
    requireColleague.mockResolvedValue(assistant);
    listMediaFiles.mockResolvedValue([
        { blobPath: "applet-shared/skills/check/SKILL.md", url: "secret" },
    ]);
    parseStreamingMultipart.mockResolvedValue({
        data: {
            fileBuffer: Buffer.from("instructions"),
            metadata: { mimeType: "text/markdown" },
        },
    });
    uploadBufferToMediaService.mockResolvedValue({ success: true });
    deleteMediaFile.mockResolvedValue({ success: true });
});
test("materials keep their folder paths in a definition-owned storage scope", async () => {
    expect((await POST(request("skills/check/SKILL.md"), context)).status).toBe(
        200,
    );
    expect(uploadBufferToMediaService).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ filename: "SKILL.md" }),
        expect.objectContaining({
            subPath: "skills/check",
            storageTarget: expect.objectContaining({
                kind: "applet-shared",
                appletId: "bbbbbbbbbbbbbbbbbbbbbbbb",
            }),
        }),
    );
    const result = await (await GET(request(""), context)).json();
    expect(result.files).toEqual([
        { path: "skills/check/SKILL.md", size: null },
    ]);
});
test.each(["../x", "/x", "skills/../x", "skills//x", "a\\b"])(
    "rejects invalid material path %s before upload",
    async (path) => {
        expect((await POST(request(path), context)).status).toBe(400);
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
    },
);
test("viewers read but cannot upload or delete; failed deletion is not success", async () => {
    requireColleague.mockResolvedValue({
        ...assistant,
        editable: false,
        isOwner: false,
    });
    expect((await GET(request("x"), context)).status).toBe(200);
    expect((await POST(request("x"), context)).status).toBe(403);
    expect((await DELETE(request("x"), context)).status).toBe(403);
    requireColleague.mockResolvedValue(assistant);
    deleteMediaFile.mockResolvedValue(null);
    expect((await DELETE(request("x"), context)).status).toBe(400);
});
test("sharing translates user IDs to contexts and only owners may change it", async () => {
    const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
    User.find.mockReturnValue({
        select: () => ({ lean: async () => [{ _id: id, contextId: "bob" }] }),
    });
    const make = () =>
        new Request("http://localhost", {
            method: "PUT",
            body: JSON.stringify({
                visibility: "private",
                recipients: [{ userId: id, role: "editor" }],
            }),
        });
    expect((await share(make(), context)).status).toBe(200);
    expect(colleagueRequest).toHaveBeenCalledWith(
        "manage",
        expect.objectContaining({
            userId: "alice",
            settings: JSON.stringify({
                visibility: "private",
                access: [{ userId: "bob", role: "editor" }],
            }),
        }),
    );
    requireColleague.mockResolvedValue({ ...assistant, isOwner: false });
    expect((await share(make(), context)).status).toBe(403);
});
test("AI drafting validates a useful configuration and does not save it", async () => {
    const config = {
        name: "Editor",
        description: "Edits",
        instructions: "Check evidence",
    };
    colleagueRequest.mockResolvedValue(config);
    const response = await draft(
        new Request("http://localhost", {
            method: "POST",
            body: JSON.stringify({ purpose: "Edit articles" }),
        }),
    );
    expect(await response.json()).toEqual(config);
    expect(colleagueRequest).toHaveBeenCalledTimes(1);
    expect(colleagueRequest.mock.calls[0][0]).toBe("draft");
});

test.each(["SKILL.md", "check.py", "check.sh"])(
    "real multipart validation accepts authored skill file %s",
    async (filename) => {
        await POST(request(`skills/check/${filename}`), context);
        const options = parseStreamingMultipart.mock.calls[0][2];
        const { parseStreamingMultipart: parse } = jest.requireActual(
            "../../utils/upload-utils",
        );
        const body = new FormData();
        body.append(
            "file",
            new Blob(["Check the source material before reporting facts."], {
                type: "application/octet-stream",
            }),
            filename,
        );
        const parsed = await parse(
            new Request("http://localhost", { method: "POST", body }),
            { _id: "author" },
            options,
        );
        expect(parsed.error).toBeUndefined();
        expect(parsed.data.metadata.filename).toBe(filename);
        expect(options.validationConfig.MAX_FILE_SIZE).toBe(32 * 1024 * 1024);
    },
);
