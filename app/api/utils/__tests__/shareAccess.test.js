/**
 * @jest-environment node
 */

import { Types } from "mongoose";

jest.mock("../../models/share.js", () => {
    const SHARE_ENTITY_TYPES = [
        "chat",
        "workspace",
        "applet",
        "automation",
        "article",
    ];
    return {
        __esModule: true,
        default: { findOne: jest.fn() },
        SHARE_ENTITY_TYPES,
        SHARE_ROLES: ["viewer", "editor"],
    };
});

jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../../models/workspace.js", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../../models/applet.js", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../../models/automation.js", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

const Share = require("../../models/share.js").default;
const Chat = require("../../models/chat.mjs").default;
const Workspace = require("../../models/workspace.js").default;

const {
    resolveShareAccess,
    getShareAccess,
    assertCanRead,
    assertCanEdit,
} = require("../shareAccess.js");

function newId() {
    return new Types.ObjectId();
}

function mockFindById(model, doc) {
    model.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(doc),
        }),
    });
}

describe("shareAccess", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("resolveShareAccess", () => {
        it("treats the owner as editor", async () => {
            const ownerId = newId();
            const access = await resolveShareAccess({
                entityType: "chat",
                entityId: newId(),
                userId: ownerId,
                ownerId,
            });
            expect(access).toEqual({
                canAccess: true,
                isOwner: true,
                role: "editor",
            });
            expect(Share.findOne).not.toHaveBeenCalled();
        });

        it("returns NO_ACCESS for unknown entity types", async () => {
            const access = await resolveShareAccess({
                entityType: "nope",
                entityId: newId(),
                userId: newId(),
                ownerId: newId(),
            });
            expect(access.canAccess).toBe(false);
        });

        it("returns NO_ACCESS for invalid entity ids", async () => {
            const access = await resolveShareAccess({
                entityType: "chat",
                entityId: "not-an-id",
                userId: newId(),
                ownerId: newId(),
            });
            expect(access.canAccess).toBe(false);
        });

        it("returns recipient role when user is in recipients", async () => {
            const userId = newId();
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    recipients: [{ userId, role: "editor" }],
                    link: { enabled: false, role: "viewer" },
                }),
            });
            const access = await resolveShareAccess({
                entityType: "chat",
                entityId: newId(),
                userId,
                ownerId: newId(),
            });
            expect(access).toEqual({
                canAccess: true,
                isOwner: false,
                role: "editor",
            });
        });

        it("preserves automation recipient editor role", async () => {
            const userId = newId();
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    recipients: [{ userId, role: "editor" }],
                    link: { enabled: false, role: "viewer" },
                }),
            });
            const access = await resolveShareAccess({
                entityType: "automation",
                entityId: newId(),
                userId,
                ownerId: newId(),
            });
            expect(access.role).toBe("editor");
        });

        it("preserves automation link editor role", async () => {
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    recipients: [],
                    link: { enabled: true, role: "editor" },
                }),
            });
            const access = await resolveShareAccess({
                entityType: "automation",
                entityId: newId(),
                userId: newId(),
                ownerId: newId(),
            });
            expect(access.role).toBe("editor");
        });

        it("returns link role when link is enabled and no recipient match", async () => {
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    recipients: [],
                    link: { enabled: true, role: "editor" },
                }),
            });
            const access = await resolveShareAccess({
                entityType: "workspace",
                entityId: newId(),
                userId: newId(),
                ownerId: newId(),
            });
            expect(access).toEqual({
                canAccess: true,
                isOwner: false,
                role: "editor",
            });
        });

        it("falls back to legacy public flag when no share doc exists", async () => {
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            });
            const access = await resolveShareAccess({
                entityType: "chat",
                entityId: newId(),
                userId: newId(),
                ownerId: newId(),
                legacyPublic: true,
            });
            expect(access).toEqual({
                canAccess: true,
                isOwner: false,
                role: "viewer",
            });
        });

        it("denies anonymous access when no share, no legacy flag", async () => {
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            });
            const access = await resolveShareAccess({
                entityType: "chat",
                entityId: newId(),
                userId: newId(),
                ownerId: newId(),
                legacyPublic: false,
            });
            expect(access.canAccess).toBe(false);
        });

        it("denies access when link disabled, no recipient match, no legacy", async () => {
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    recipients: [{ userId: newId(), role: "viewer" }],
                    link: { enabled: false, role: "viewer" },
                }),
            });
            const access = await resolveShareAccess({
                entityType: "workspace",
                entityId: newId(),
                userId: newId(),
                ownerId: newId(),
            });
            expect(access.canAccess).toBe(false);
        });
    });

    describe("getShareAccess", () => {
        it("returns NO_ACCESS when entity is missing", async () => {
            mockFindById(Chat, null);
            const access = await getShareAccess({
                entityType: "chat",
                entityId: newId(),
                userId: newId(),
            });
            expect(access.canAccess).toBe(false);
        });

        it("uses entity owner when loading by id without legacy workspace publish", async () => {
            const ownerId = newId();
            mockFindById(Workspace, { owner: ownerId, published: true });
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            });
            const access = await getShareAccess({
                entityType: "workspace",
                entityId: newId(),
                userId: newId(),
            });
            expect(access.canAccess).toBe(false);
        });
    });

    describe("assertCanRead / assertCanEdit", () => {
        it("assertCanRead throws when no access", async () => {
            mockFindById(Chat, null);
            await expect(
                assertCanRead({
                    entityType: "chat",
                    entityId: newId(),
                    userId: newId(),
                }),
            ).rejects.toThrow("Unauthorized access");
        });

        it("assertCanEdit throws when role is viewer", async () => {
            const ownerId = newId();
            mockFindById(Chat, { userId: ownerId, isPublic: true });
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            });
            await expect(
                assertCanEdit({
                    entityType: "chat",
                    entityId: newId(),
                    userId: newId(),
                }),
            ).rejects.toThrow("Unauthorized access");
        });

        it("assertCanEdit succeeds when owner", async () => {
            const ownerId = newId();
            mockFindById(Chat, { userId: ownerId, isPublic: false });
            const access = await assertCanEdit({
                entityType: "chat",
                entityId: newId(),
                userId: ownerId,
            });
            expect(access.isOwner).toBe(true);
        });

        it("assertCanEdit allows shared automation editors", async () => {
            const ownerId = newId();
            const userId = newId();
            const {
                default: Automation,
            } = require("../../models/automation.js");
            mockFindById(Automation, { owner: ownerId });
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    recipients: [{ userId, role: "editor" }],
                    link: { enabled: false, role: "viewer" },
                }),
            });
            const access = await assertCanEdit({
                entityType: "automation",
                entityId: newId(),
                userId,
            });
            expect(access.role).toBe("editor");
        });
    });
});
