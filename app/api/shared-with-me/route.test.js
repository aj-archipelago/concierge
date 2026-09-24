/**
 * @jest-environment node
 */

import { GET } from "./route.js";
import Share from "../models/share";
import Workspace from "../models/workspace";

const userId = "507f191e810c19729de860ea";
const workspaceId = "69fcdbb6ac8ccc9ef8a8c0b4";

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(async () => ({ _id: userId })),
    handleError: jest.fn((error) =>
        Response.json({ error: error.message }, { status: 500 }),
    ),
}));

jest.mock("../models/share", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
    SHARE_ENTITY_TYPES: [
        "chat",
        "workspace",
        "applet",
        "published_applet",
        "automation",
        "article",
    ],
}));

jest.mock("../models/chat.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

jest.mock("../models/workspace", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

jest.mock("../models/automation", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

jest.mock("../models/article", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

function mockShareFind(docs) {
    Share.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn(async () => docs),
    });
}

function mockModelFind(model, docs) {
    model.find.mockReturnValue({
        lean: jest.fn(async () => docs),
    });
}

describe("GET /api/shared-with-me", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockShareFind([]);
        mockModelFind(Workspace, []);
    });

    it("normalizes stale viewer-only recipient roles", async () => {
        mockShareFind([
            {
                entityType: "workspace",
                entityId: workspaceId,
                recipients: [{ userId, role: "editor" }],
                updatedAt: new Date("2026-07-03T00:00:00.000Z"),
            },
        ]);
        mockModelFind(Workspace, [
            {
                _id: workspaceId,
                name: "Shared workspace",
                slug: "shared-workspace",
                owner: "507f191e810c19729de860eb",
            },
        ]);

        const response = await GET({
            url: "https://example.com/api/shared-with-me?type=workspace",
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual([
            expect.objectContaining({
                entityType: "workspace",
                entityId: workspaceId,
                title: "Shared workspace",
                role: "viewer",
            }),
        ]);
    });
});
