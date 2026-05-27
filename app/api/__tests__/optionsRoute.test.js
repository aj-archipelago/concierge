/**
 * @jest-environment node
 */

jest.mock("mongoose", () => ({
    connection: {
        readyState: 1,
    },
}));

jest.mock("../models/user", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../../../src/graphql", () => ({
    getClient: jest.fn(),
    SYS_ENTITY_UPDATE: "SYS_ENTITY_UPDATE",
}));

const { POST } = require("../options/route");
const User = require("../models/user").default;
const { getClient } = require("../../../src/graphql");

describe("options route personal entity sync", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("syncs aiName through SYS_ENTITY_UPDATE on the user's personal entity", async () => {
        const save = jest.fn().mockResolvedValue(undefined);
        User.findOne.mockResolvedValue({
            userId: "user-1",
            contextId: "context-1",
            aiName: "Old Name",
            personalEntityId: "personal-context-1",
            save,
        });

        const query = jest.fn().mockResolvedValue({
            data: {
                sys_entity_update: {
                    result: JSON.stringify({ success: true, name: "Lana" }),
                },
            },
        });
        getClient.mockReturnValue({ query });

        const response = await POST({
            json: async () => ({
                userId: "user-1",
                aiName: "Lana",
            }),
        });

        expect(query).toHaveBeenCalledWith({
            query: "SYS_ENTITY_UPDATE",
            variables: {
                entityId: "personal-context-1",
                contextId: "context-1",
                name: "Lana",
            },
            fetchPolicy: "network-only",
        });
        expect(save).toHaveBeenCalledTimes(1);
        expect(response).toBeInstanceOf(Response);
    });
});
