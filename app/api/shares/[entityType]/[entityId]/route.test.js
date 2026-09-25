/**
 * @jest-environment node
 */

import { GET, PUT } from "./route.js";
import Share from "../../../models/share.js";

const entityId = "69fcdbb6ac8ccc9ef8a8c0b4";
const ownerId = "507f191e810c19729de860ea";

jest.mock("../../../models/chat.mjs", () => ({
    __esModule: true,
    default: { updateOne: jest.fn() },
}));

jest.mock("../../../models/workspace.js", () => ({
    __esModule: true,
    default: { updateOne: jest.fn() },
}));

jest.mock("../../../models/share.js", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(() => ({
            populate: jest.fn().mockReturnThis(),
            lean: jest.fn(async () => null),
        })),
        findOneAndUpdate: jest.fn(async () => ({})),
    },
    SHARE_ENTITY_TYPES: [
        "chat",
        "workspace",
        "applet",
        "published_applet",
        "automation",
        "article",
    ],
    SHARE_ROLES: ["viewer", "editor"],
}));

jest.mock("../../../utils/auth.js", () => ({
    getCurrentUser: jest.fn(async () => ({ _id: ownerId })),
    handleError: jest.fn((error) =>
        Response.json({ error: error.message }, { status: 500 }),
    ),
}));

jest.mock("../../../utils/shareAccess.js", () => ({
    getEntityOwner: jest.fn(async () => ({
        ownerId,
        legacyPublic: false,
    })),
}));

describe("GET /api/shares/[entityType]/[entityId]", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("resolves async route params (Next.js 15+)", async () => {
        const response = await GET(
            {},
            {
                params: Promise.resolve({
                    entityType: "automation",
                    entityId,
                }),
            },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.entityType).toBe("automation");
        expect(body.entityId).toBe(entityId);
        expect(Share.findOne).toHaveBeenCalledWith({
            entityType: "automation",
            entityId,
        });
    });

    it("hydrates legacy public chats into the share dialog shape", async () => {
        const { getEntityOwner } = await import(
            "../../../utils/shareAccess.js"
        );
        getEntityOwner.mockResolvedValueOnce({
            ownerId,
            legacyPublic: true,
        });

        const response = await GET(
            {},
            {
                params: Promise.resolve({
                    entityType: "chat",
                    entityId,
                }),
            },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({
            entityType: "chat",
            entityId,
            link: { enabled: true, role: "viewer" },
            recipients: [],
        });
    });

    it("normalizes stale viewer-only roles when reading share settings", async () => {
        const recipientId = "507f191e810c19729de860eb";
        Share.findOne.mockReturnValueOnce({
            populate: jest.fn().mockReturnThis(),
            lean: jest.fn(async () => ({
                entityType: "workspace",
                entityId,
                link: { enabled: true, role: "editor" },
                recipients: [
                    {
                        userId: {
                            _id: recipientId,
                            name: "Recipient",
                            username: "recipient",
                        },
                        role: "editor",
                    },
                ],
                updatedAt: new Date("2026-07-03T00:00:00.000Z"),
            })),
        });

        const response = await GET(
            {},
            {
                params: Promise.resolve({
                    entityType: "workspace",
                    entityId,
                }),
            },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.link).toEqual({ enabled: true, role: "viewer" });
        expect(body.recipients).toEqual([
            expect.objectContaining({
                userId: recipientId,
                role: "viewer",
            }),
        ]);
    });

    it("forces viewer-only link roles for workspaces", async () => {
        Share.findOne
            .mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn(async () => null),
                }),
            })
            .mockReturnValueOnce({
                populate: jest.fn().mockReturnThis(),
                lean: jest.fn(async () => ({
                    entityType: "workspace",
                    entityId,
                    link: { enabled: true, role: "viewer" },
                    recipients: [],
                    updatedAt: new Date("2026-07-03T00:00:00.000Z"),
                })),
            });

        const response = await PUT(
            {
                json: async () => ({
                    link: { enabled: true, role: "editor" },
                }),
            },
            {
                params: Promise.resolve({
                    entityType: "workspace",
                    entityId,
                }),
            },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.link).toEqual({ enabled: true, role: "viewer" });
        expect(Share.findOneAndUpdate.mock.calls[0][1].$set.link).toEqual({
            enabled: true,
            role: "viewer",
        });
    });
});
