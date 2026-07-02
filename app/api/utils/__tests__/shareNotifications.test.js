/**
 * @jest-environment node
 */

jest.mock("../../models/notification.mjs", () => ({
    __esModule: true,
    default: {
        create: jest.fn(async (payload) => ({
            _id: "notification-1",
            ...payload,
        })),
    },
}));

jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(() => ({
            select: jest.fn(() => ({
                lean: jest.fn(async () => ({ title: "Team standup" })),
            })),
        })),
    },
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

const Notification = require("../../models/notification.mjs").default;
const {
    findNewShareRecipients,
    notifyNewShareRecipients,
} = require("../shareNotifications.js");

describe("shareNotifications", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("findNewShareRecipients", () => {
        it("returns recipients that were not previously shared with", () => {
            const previous = [{ userId: "user-a", role: "viewer" }];
            const next = [
                { userId: "user-a", role: "viewer" },
                { userId: "user-b", role: "editor" },
            ];

            expect(findNewShareRecipients(previous, next)).toEqual([
                { userId: "user-b", role: "editor" },
            ]);
        });

        it("returns an empty list when recipients are unchanged", () => {
            const recipients = [{ userId: "user-a", role: "viewer" }];
            expect(findNewShareRecipients(recipients, recipients)).toEqual([]);
        });
    });

    describe("notifyNewShareRecipients", () => {
        it("creates notifications for newly added recipients", async () => {
            const sharedBy = {
                _id: "owner-1",
                name: "Hammad",
                username: "hammad@example.com",
            };

            await notifyNewShareRecipients({
                entityType: "chat",
                entityId: "507f1f77bcf86cd799439011",
                previousRecipients: [],
                nextRecipients: [{ userId: "user-b", role: "viewer" }],
                sharedBy,
            });

            expect(Notification.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    owner: "user-b",
                    type: "resource-shared",
                    metadata: expect.objectContaining({
                        entityType: "chat",
                        entityId: "507f1f77bcf86cd799439011",
                        entityTitle: "Team standup",
                        sharedByName: "Hammad",
                        role: "viewer",
                        url: "/chat/507f1f77bcf86cd799439011",
                    }),
                }),
            );
        });

        it("skips notification creation when no recipients were added", async () => {
            await notifyNewShareRecipients({
                entityType: "chat",
                entityId: "507f1f77bcf86cd799439011",
                previousRecipients: [{ userId: "user-b", role: "viewer" }],
                nextRecipients: [{ userId: "user-b", role: "viewer" }],
                sharedBy: { _id: "owner-1", name: "Hammad" },
            });

            expect(Notification.create).not.toHaveBeenCalled();
        });

        it("uses the published applet URL when a publish override is provided", async () => {
            const Applet = require("../../models/applet.js").default;
            Applet.findById.mockReturnValue({
                select: jest.fn(() => ({
                    lean: jest.fn(async () => ({ name: "Budget tracker" })),
                })),
            });

            await notifyNewShareRecipients({
                entityType: "applet",
                entityId: "507f1f77bcf86cd799439012",
                previousRecipients: [],
                nextRecipients: [{ userId: "user-b", role: "viewer" }],
                sharedBy: { _id: "owner-1", name: "Hammad" },
                url: "/published/applets/507f1f77bcf86cd799439012",
            });

            expect(Notification.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        entityType: "applet",
                        url: "/published/applets/507f1f77bcf86cd799439012",
                    }),
                }),
            );
        });

        it("uses the draft applet URL for standard applet shares", async () => {
            const Applet = require("../../models/applet.js").default;
            Applet.findById.mockReturnValue({
                select: jest.fn(() => ({
                    lean: jest.fn(async () => ({ name: "Budget tracker" })),
                })),
            });

            await notifyNewShareRecipients({
                entityType: "applet",
                entityId: "507f1f77bcf86cd799439012",
                previousRecipients: [],
                nextRecipients: [{ userId: "user-b", role: "viewer" }],
                sharedBy: { _id: "owner-1", name: "Hammad" },
            });

            expect(Notification.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        url: "/applets/507f1f77bcf86cd799439012",
                    }),
                }),
            );
        });
    });
});
