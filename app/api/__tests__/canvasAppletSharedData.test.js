/**
 * @jest-environment node
 */

import { GET, PUT } from "../canvas-applets/[id]/shared-data/[key]/route";
import { GET as BACKUPS } from "../canvas-applets/[id]/shared-data/[key]/backups/route";
import { POST as RESTORE } from "../canvas-applets/[id]/shared-data/[key]/restore/route";

jest.mock("next/server", () => ({
    NextResponse: {
        json: (data, options) => ({
            ...data,
            status: (options && options.status) || 200,
        }),
    },
}));

jest.mock("next/headers", () => ({
    headers: jest.fn(
        () =>
            new Map([
                ["host", "localhost:3000"],
                ["x-forwarded-proto", "http"],
            ]),
    ),
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../utils/fileValidation", () => ({
    validateMongoDBKey: jest.fn(),
}));

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findById: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock("../models/applet-shared-data", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        create: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock("../models/applet-shared-data-revision", () => ({
    __esModule: true,
    default: {
        create: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
    },
}));

jest.mock("mongoose", () => ({
    __esModule: true,
    default: {
        Types: {
            ObjectId: {
                isValid: jest.fn(),
            },
        },
    },
}));

describe("Canvas Applet Shared Data Routes", () => {
    const appletId = "applet123";
    const userId = "user123";
    let mockUser;
    let mockApplet;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: userId,
            toString: () => userId,
        };
        mockApplet = {
            _id: appletId,
            owner: { toString: () => userId },
            version: 2,
            publishedVersionIndex: 0,
        };

        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue(mockUser);

        const { validateMongoDBKey } = require("../utils/fileValidation");
        validateMongoDBKey.mockImplementation((key) => ({
            isValid: true,
            sanitizedKey: key,
        }));

        const mongoose = require("mongoose").default;
        mongoose.Types.ObjectId.isValid.mockReturnValue(true);

        const Applet = require("../models/applet").default;
        Applet.findOne.mockResolvedValue(mockApplet);
        Applet.findById.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        });
        Applet.updateOne.mockResolvedValue({});
    });

    test("missing load returns found=false and does not create default data", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        AppletSharedData.findOne.mockResolvedValue(null);

        const response = await GET(
            {
                url: `https://example.com/api/canvas-applets/${appletId}/shared-data/workspace`,
            },
            { params: { id: appletId, key: "workspace" } },
        );

        expect(response.status).toBe(200);
        expect(response).toMatchObject({
            found: false,
            value: null,
            revision: null,
        });
        expect(AppletSharedData.create).not.toHaveBeenCalled();
    });

    test("first set creates missing shared data", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        AppletSharedData.findOne.mockResolvedValue(null);
        AppletSharedData.create.mockResolvedValue({
            appletId,
            key: "workspace",
            value: { sources: [] },
            revision: 1,
        });

        const request = {
            json: () =>
                Promise.resolve({
                    value: { sources: [] },
                    expectedRevision: null,
                }),
        };

        const response = await PUT(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(200);
        expect(response.revision).toBe("1");
        expect(AppletSharedData.create).toHaveBeenCalledWith({
            appletId,
            key: "workspace",
            value: { sources: [] },
            revision: 1,
            createdBy: userId,
            updatedBy: userId,
        });
    });

    test("shared values must be objects for encrypted storage", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        const request = {
            json: () =>
                Promise.resolve({
                    value: "not an object",
                    expectedRevision: null,
                    create: true,
                }),
        };

        const response = await PUT(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(400);
        expect(response.error).toBe("value must be an object");
        expect(AppletSharedData.findOne).not.toHaveBeenCalled();
    });

    test("missing shared data conflicts when caller expected an existing revision", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        AppletSharedData.findOne.mockResolvedValue(null);

        const request = {
            json: () =>
                Promise.resolve({
                    value: { sources: [] },
                    expectedRevision: "3",
                }),
        };

        const response = await PUT(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(409);
        expect(response.code).toBe("SHARED_DATA_REVISION_CONFLICT");
        expect(AppletSharedData.create).not.toHaveBeenCalled();
    });

    test("revision conflict blocks stale overwrite", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        AppletSharedData.findOne.mockResolvedValue({
            appletId,
            key: "workspace",
            value: { sources: [{ id: 1 }] },
            revision: 3,
        });

        const request = {
            json: () =>
                Promise.resolve({
                    value: { sources: [{ id: 2 }] },
                    expectedRevision: "2",
                }),
        };

        const response = await PUT(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(409);
        expect(response.code).toBe("SHARED_DATA_REVISION_CONFLICT");
        expect(AppletSharedData.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("empty state cannot overwrite non-empty data with set", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        AppletSharedData.findOne.mockResolvedValue({
            appletId,
            key: "workspace",
            value: { sources: [{ id: 1 }], cases: [] },
            revision: 3,
        });

        const request = {
            json: () =>
                Promise.resolve({
                    value: { sources: [], cases: [], name: "" },
                    expectedRevision: "3",
                }),
        };

        const response = await PUT(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(409);
        expect(response.code).toBe("SHARED_DATA_EMPTY_OVERWRITE_BLOCKED");
        expect(response.error).toContain("Use sharedData.reset()");
        expect(AppletSharedData.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("zero and false values can replace non-empty data with set", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        const existing = {
            appletId,
            key: "workspace",
            value: { sources: [{ id: 1 }], enabled: true, count: 3 },
            revision: 3,
        };
        AppletSharedData.findOne.mockResolvedValue(existing);
        AppletSharedData.findOneAndUpdate.mockResolvedValue({
            ...existing,
            value: { enabled: false, count: 0 },
            revision: 4,
        });

        const request = {
            json: () =>
                Promise.resolve({
                    value: { enabled: false, count: 0 },
                    expectedRevision: "3",
                }),
        };

        const response = await PUT(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(200);
        expect(response.value).toEqual({ enabled: false, count: 0 });
        expect(AppletSharedData.findOneAndUpdate).toHaveBeenCalledWith(
            { appletId, key: "workspace", revision: 3 },
            {
                $set: {
                    value: { enabled: false, count: 0 },
                    revision: 4,
                    updatedBy: userId,
                },
            },
            { new: true, runValidators: true },
        );
    });

    test("successful replace creates a pre-write backup", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        const AppletSharedDataRevision =
            require("../models/applet-shared-data-revision").default;
        const existing = {
            appletId,
            key: "workspace",
            value: { sources: [{ id: 1 }] },
            revision: 3,
        };
        AppletSharedData.findOne.mockResolvedValue(existing);
        AppletSharedData.findOneAndUpdate.mockResolvedValue({
            ...existing,
            value: { sources: [{ id: 1 }, { id: 2 }] },
            revision: 4,
        });

        const request = {
            json: () =>
                Promise.resolve({
                    value: { sources: [{ id: 1 }, { id: 2 }] },
                    expectedRevision: "3",
                }),
        };

        const response = await PUT(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(200);
        expect(response.revision).toBe("4");
        expect(AppletSharedDataRevision.create).toHaveBeenCalledWith({
            appletId,
            key: "workspace",
            revision: 3,
            value: { sources: [{ id: 1 }] },
            reason: "replace",
            createdBy: userId,
        });
        expect(AppletSharedData.findOneAndUpdate).toHaveBeenCalledWith(
            { appletId, key: "workspace", revision: 3 },
            {
                $set: {
                    value: { sources: [{ id: 1 }, { id: 2 }] },
                    revision: 4,
                    updatedBy: userId,
                },
            },
            { new: true, runValidators: true },
        );
    });

    test("explicit reset can replace non-empty data with empty state and backup", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        const AppletSharedDataRevision =
            require("../models/applet-shared-data-revision").default;
        const existing = {
            appletId,
            key: "workspace",
            value: { sources: [{ id: 1 }] },
            revision: 3,
        };
        AppletSharedData.findOne.mockResolvedValue(existing);
        AppletSharedData.findOneAndUpdate.mockResolvedValue({
            ...existing,
            value: { sources: [] },
            revision: 4,
        });

        const request = {
            json: () =>
                Promise.resolve({
                    value: { sources: [] },
                    expectedRevision: "3",
                    reset: true,
                }),
        };

        const response = await PUT(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(200);
        expect(AppletSharedDataRevision.create).toHaveBeenCalledWith(
            expect.objectContaining({ reason: "reset" }),
        );
    });

    test("restore replaces live data from a backup and backs up current state", async () => {
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        const AppletSharedDataRevision =
            require("../models/applet-shared-data-revision").default;
        const existing = {
            appletId,
            key: "workspace",
            value: { sources: [] },
            revision: 4,
        };
        const backup = {
            _id: "backup1",
            appletId,
            key: "workspace",
            value: { sources: [{ id: 1 }] },
            revision: 3,
        };
        AppletSharedData.findOne.mockResolvedValue(existing);
        AppletSharedDataRevision.findOne.mockResolvedValue(backup);
        AppletSharedData.findOneAndUpdate.mockResolvedValue({
            ...existing,
            value: backup.value,
            revision: 5,
        });

        const request = {
            json: () =>
                Promise.resolve({
                    backupId: "backup1",
                }),
        };

        const response = await RESTORE(request, {
            params: { id: appletId, key: "workspace" },
        });

        expect(response.status).toBe(200);
        expect(response.key).toBe("workspace");
        expect(response.value).toEqual({ sources: [{ id: 1 }] });
        expect(response.revision).toBe("5");
        expect(response.restoredFromRevision).toBe("3");
        expect(AppletSharedDataRevision.create).toHaveBeenCalledWith({
            appletId,
            key: "workspace",
            revision: 4,
            value: { sources: [] },
            reason: "restore",
            createdBy: userId,
        });
    });

    test("backup list returns recent recovery snapshots", async () => {
        const AppletSharedDataRevision =
            require("../models/applet-shared-data-revision").default;
        const backups = [
            {
                _id: { toString: () => "backup1" },
                revision: 3,
                value: { sources: [{ id: 1 }] },
                reason: "replace",
                createdAt: "2026-05-24T00:00:00.000Z",
                createdBy: { toString: () => userId },
            },
        ];
        const lean = jest.fn().mockResolvedValue(backups);
        const limit = jest.fn().mockReturnValue({ lean });
        const sort = jest.fn().mockReturnValue({ limit });
        AppletSharedDataRevision.find.mockReturnValue({ sort });

        const response = await BACKUPS(
            {
                url: `https://example.com/api/canvas-applets/${appletId}/shared-data/workspace/backups`,
            },
            { params: { id: appletId, key: "workspace" } },
        );

        expect(response.status).toBe(200);
        expect(response.backups).toEqual([
            {
                id: "backup1",
                revision: "3",
                value: { sources: [{ id: 1 }] },
                reason: "replace",
                createdAt: "2026-05-24T00:00:00.000Z",
                createdBy: userId,
            },
        ]);
        expect(AppletSharedDataRevision.find).toHaveBeenCalledWith({
            appletId,
            key: "workspace",
        });
        expect(sort).toHaveBeenCalledWith({ revision: -1, createdAt: -1 });
        expect(limit).toHaveBeenCalledWith(50);
    });
});
