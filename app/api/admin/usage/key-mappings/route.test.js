/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => ({ body, init })),
    },
}));

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
    handleError: jest.fn((error) => ({
        body: { error: error.message },
        init: { status: 500 },
    })),
}));

jest.mock("../../../models/apiKeyMapping.mjs", () => ({
    find: jest.fn(),
}));

import ApiKeyMapping from "../../../models/apiKeyMapping.mjs";
import { getCurrentUser } from "../../../utils/auth";
import { GET } from "./route";

function mockMappingQuery(rows) {
    return {
        lean: jest.fn().mockResolvedValue(rows),
    };
}

describe("GET /api/admin/usage/key-mappings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: "admin-1", role: "admin" });
        ApiKeyMapping.find.mockReturnValue(
            mockMappingQuery([
                { apiKeyHash: "key-a", label: "Production" },
                { apiKeyHash: "key-b", label: "Development" },
            ]),
        );
    });

    it("requires an admin user", async () => {
        getCurrentUser.mockResolvedValue({ _id: "user-1", role: "user" });

        const response = await GET();

        expect(response.init).toEqual({ status: 403 });
        expect(ApiKeyMapping.find).not.toHaveBeenCalled();
    });

    it("returns API key hash labels", async () => {
        const response = await GET();

        expect(ApiKeyMapping.find).toHaveBeenCalledWith(
            {},
            "apiKeyHash label",
        );
        expect(response.body).toEqual({
            "key-a": "Production",
            "key-b": "Development",
        });
    });
});
