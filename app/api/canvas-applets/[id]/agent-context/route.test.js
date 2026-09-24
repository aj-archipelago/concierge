/** @jest-environment node */

import { GET, POST } from "./route";
import { getCanvasAppletForDataAccess } from "../utils";
import {
    deleteMediaFile,
    hashBuffer,
    listMediaFiles,
    uploadBufferToMediaService,
} from "../../../utils/media-service-utils";

const APPLET_ID = "507f191e810c19729de860ea";
const OTHER_APPLET_ID = "507f191e810c19729de860eb";
const CONTEXT = `applet-shared:${APPLET_ID}`;

jest.mock("../utils", () => ({ getCanvasAppletForDataAccess: jest.fn() }));
jest.mock("../../../models/applet", () => ({
    __esModule: true,
    default: { findByIdAndUpdate: jest.fn(), findOne: jest.fn() },
}));
jest.mock("../../../utils/media-service-utils", () => ({
    checkMediaFile: jest.fn(),
    deleteMediaFile: jest.fn(),
    hashBuffer: jest.fn(),
    listMediaFiles: jest.fn(),
    uploadBufferToMediaService: jest.fn(),
}));
jest.mock("../../../utils/llm-file-utils", () => ({
    fetchAllowedBlobUrl: jest.fn(),
}));
jest.mock("../../../../../src/utils/storageTargets", () => ({
    createAgentContextStorageTarget: (contextId) => ({
        kind: "agent-context",
        contextId,
    }),
    createChatStorageTarget: (userContextId, chatId) => ({
        kind: "chat",
        userContextId,
        chatId,
    }),
}));

function access(overrides = {}) {
    return {
        ...overrides,
        applet: {
            _id: APPLET_ID,
            owner: "user-1",
            agentContext: null,
            ...overrides.applet,
        },
        user: {
            _id: "user-1",
            contextId: "ctx-1",
            role: "user",
            ...overrides.user,
        },
        access: { role: "owner" },
        ...(overrides.access ? { access: overrides.access } : {}),
    };
}

function request(body) {
    return { json: async () => body };
}

describe("applet agent context", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCanvasAppletForDataAccess.mockResolvedValue(access());
        listMediaFiles.mockResolvedValue([]);
        hashBuffer.mockResolvedValue("file-hash");
        uploadBufferToMediaService.mockResolvedValue({
            success: true,
            data: { blobPath: "file.md" },
        });
        deleteMediaFile.mockResolvedValue({ success: true });
        const Applet = require("../../../models/applet").default;
        Applet.findOne.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({ _id: OTHER_APPLET_ID }),
            }),
        });
    });

    test("initializes one reusable folder and persists its binding", async () => {
        const Applet = require("../../../models/applet").default;
        const response = await POST(request({ action: "initialize" }), {
            params: Promise.resolve({ id: APPLET_ID }),
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result).toEqual({
            success: true,
            agentContext: expect.stringMatching(/^applet-shared:[a-f0-9]{24}$/),
        });
        expect(result.agentContext).not.toBe(CONTEXT);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(APPLET_ID, {
            agentContext: result.agentContext,
        });
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
    });

    test("does not invent instruction files during initialization", async () => {
        const Applet = require("../../../models/applet").default;
        const response = await POST(
            request({
                action: "initialize",
                agentsContent: "legacy agents",
                skillContent: "legacy skill",
            }),
            { params: Promise.resolve({ id: APPLET_ID }) },
        );

        expect(response.status).toBe(200);
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
        expect(Applet.findByIdAndUpdate).toHaveBeenCalled();
    });

    test("writes ordinary context files at the container root", async () => {
        getCanvasAppletForDataAccess.mockResolvedValue(
            access({ applet: { agentContext: CONTEXT } }),
        );

        const response = await POST(
            request({
                action: "upsert",
                filename: "favorite-football-player.md",
                content: "Tsubasa",
            }),
            { params: Promise.resolve({ id: APPLET_ID }) },
        );

        expect(response.status).toBe(200);
        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: "favorite-football-player.md",
                hash: "file-hash",
            }),
            {
                storageTarget: {
                    kind: "agent-context",
                    contextId: CONTEXT,
                },
                subPath: null,
            },
        );
    });

    test("replaces a prior logical root filename", async () => {
        getCanvasAppletForDataAccess.mockResolvedValue(
            access({ applet: { agentContext: CONTEXT } }),
        );
        listMediaFiles.mockResolvedValue([
            {
                blobPath: "generated-old.md",
                displayFilename: "AGENTS.md",
            },
        ]);
        uploadBufferToMediaService.mockResolvedValue({
            success: true,
            data: { blobPath: "generated-new.md" },
        });

        const response = await POST(
            request({
                action: "upsert",
                filename: "AGENTS.md",
                content: "New",
            }),
            { params: Promise.resolve({ id: APPLET_ID }) },
        );

        expect(response.status).toBe(200);
        expect(deleteMediaFile).toHaveBeenCalledWith(
            expect.objectContaining({
                blobPath: "generated-old.md",
                fallbackToHash: false,
            }),
        );
    });

    test("requires the source owner to create a cross-applet binding", async () => {
        getCanvasAppletForDataAccess
            .mockResolvedValueOnce(access())
            .mockResolvedValueOnce(
                access({
                    applet: { _id: OTHER_APPLET_ID, owner: "owner-2" },
                    access: { role: "editor" },
                }),
            );

        const response = await POST(
            request({
                action: "initialize",
                agentContext: `applet-shared:${OTHER_APPLET_ID}`,
            }),
            { params: Promise.resolve({ id: APPLET_ID }) },
        );

        expect(response.status).toBe(403);
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
    });

    test("reports attachment without revealing the context location", async () => {
        getCanvasAppletForDataAccess.mockResolvedValue(
            access({ applet: { agentContext: CONTEXT } }),
        );

        const response = await GET(null, {
            params: Promise.resolve({ id: APPLET_ID }),
        });

        expect(await response.json()).toEqual({
            appletId: APPLET_ID,
            attached: true,
            canManage: true,
        });
    });

    test("lets a target editor manage an owner-authorized binding", async () => {
        getCanvasAppletForDataAccess.mockResolvedValue(
            access({
                applet: {
                    owner: "owner-1",
                    agentContext: `applet-shared:${OTHER_APPLET_ID}`,
                },
                user: { _id: "editor-1" },
                access: { role: "editor" },
            }),
        );

        const response = await POST(request({ action: "list" }), {
            params: Promise.resolve({ id: APPLET_ID }),
        });

        expect(response.status).toBe(200);
        expect(listMediaFiles).toHaveBeenCalledWith({
            storageTarget: {
                kind: "agent-context",
                contextId: `applet-shared:${OTHER_APPLET_ID}`,
            },
        });
    });
});
