/**
 * @jest-environment node
 */

jest.mock("../../models/workspace.js", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

const Workspace = require("../../models/workspace.js").default;
const { resolveAuthorizedMediaRouting } = require("../file-route-utils.js");

const createSelectQuery = (value) => ({
    select: jest.fn().mockResolvedValue(value),
});

describe("resolveAuthorizedMediaRouting", () => {
    const user = {
        _id: "mongo-user-1",
        contextId: "user-context-1",
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns user-scoped chat routing by default", async () => {
        const result = await resolveAuthorizedMediaRouting({
            user,
            routingInput: {
                chatId: "chat-123",
                fileScope: "chat",
            },
        });

        expect(result.routingParams).toEqual({
            contextId: "user-context-1",
            userId: "user-context-1",
            chatId: "chat-123",
            fileScope: "chat",
        });
    });

    it("treats a foreign contextId-only request as workspace-shared routing", async () => {
        Workspace.findOne.mockReturnValue(
            createSelectQuery({ _id: "workspace-123" }),
        );

        const result = await resolveAuthorizedMediaRouting({
            user,
            routingInput: {
                contextId: "workspace-123",
            },
        });

        expect(Workspace.findOne).toHaveBeenCalledWith({
            _id: "workspace-123",
            owner: "mongo-user-1",
        });
        expect(result.routingParams).toEqual({
            contextId: "workspace-123",
            workspaceId: "workspace-123",
            fileScope: "workspace-shared-legacy",
        });
    });

    it("rejects attempts to route through another user's context", async () => {
        await expect(
            resolveAuthorizedMediaRouting({
                user,
                routingInput: {
                    userId: "other-user-context",
                    fileScope: "global",
                },
            }),
        ).rejects.toMatchObject({
            status: 403,
            message: "Not authorized to access files in this context",
        });
    });
});
