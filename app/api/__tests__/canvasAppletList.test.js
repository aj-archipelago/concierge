/**
 * @jest-environment node
 */

import { Types } from "mongoose";
import { listAppletRegistry } from "../canvas-applets/registry";

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../models/share.js", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../models/app", () => ({
    __esModule: true,
    APP_STATUS: { ACTIVE: "active" },
    APP_TYPES: { APPLET: "applet" },
    default: {
        find: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue([]),
        })),
    },
}));

jest.mock("../models/media-item.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        })),
    },
}));

jest.mock("../canvas-applets/files", () => ({
    getCanvasAppletEditableFileInfo: jest.fn(async () => ({
        fileHash: null,
        fileBlobPath: null,
        workspacePath: null,
    })),
}));

const Applet = require("../models/applet").default;
const Share = require("../models/share.js").default;
const App = require("../models/app").default;

describe("listAppletRegistry", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        App.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
        });
    });

    it("includes owned and recipient-shared applets with share metadata", async () => {
        const userId = new Types.ObjectId();
        const ownedId = new Types.ObjectId();
        const sharedId = new Types.ObjectId();
        const otherOwnerId = new Types.ObjectId();

        Share.find
            .mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([
                        {
                            entityId: ownedId,
                            ownerId: userId,
                            link: { enabled: true, role: "viewer" },
                            recipients: [],
                        },
                    ]),
                }),
            })
            .mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([
                        {
                            entityId: sharedId,
                            ownerId: otherOwnerId,
                            recipients: [{ userId, role: "viewer" }],
                        },
                    ]),
                }),
            });

        Applet.find
            .mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([
                        {
                            _id: ownedId,
                            owner: userId,
                            name: "Mine",
                            version: 2,
                            updatedAt: "2026-06-02T10:00:00.000Z",
                        },
                    ]),
                }),
            })
            .mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([
                        {
                            _id: sharedId,
                            owner: otherOwnerId,
                            name: "Shared with me",
                            version: 2,
                            updatedAt: "2026-06-01T10:00:00.000Z",
                        },
                    ]),
                }),
            });

        const result = await listAppletRegistry({ _id: userId });

        expect(result.applets).toHaveLength(2);
        expect(result.applets[0]).toMatchObject({
            _id: ownedId,
            isOwner: true,
            isShared: false,
            shareRole: "editor",
            isSharedOut: true,
        });
        expect(result.applets[1]).toMatchObject({
            _id: sharedId,
            isOwner: false,
            isShared: true,
            shareRole: "viewer",
            isSharedOut: false,
        });
        expect(Share.find).toHaveBeenCalledWith({
            entityType: "applet",
            ownerId: userId,
        });
        expect(Share.find).toHaveBeenCalledWith({
            entityType: "applet",
            "recipients.userId": userId,
        });
    });

    it("uses the richest app metadata when duplicate app records reference one applet", async () => {
        const userId = new Types.ObjectId();
        const appletId = new Types.ObjectId();

        Applet.find.mockReturnValueOnce({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    {
                        _id: appletId,
                        owner: userId,
                        name: "Canvas Name",
                        version: 2,
                        updatedAt: "2026-06-02T10:00:00.000Z",
                    },
                ]),
            }),
        });
        Share.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([]),
            }),
        });
        App.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    appletId,
                    name: "Stale Metadata",
                    status: "active",
                    updatedAt: "2026-06-10T21:00:00.000Z",
                },
                {
                    _id: new Types.ObjectId(),
                    appletId,
                    name: "Image Metadata",
                    status: "active",
                    listedInStore: true,
                    imageUrl: "https://images.example/applet.png",
                    updatedAt: "2026-06-10T20:00:00.000Z",
                },
            ]),
        });

        const result = await listAppletRegistry({ _id: userId });

        expect(result.applets).toHaveLength(1);
        expect(result.applets[0].app).toMatchObject({
            name: "Image Metadata",
            imageUrl: "https://images.example/applet.png",
        });
    });
});
