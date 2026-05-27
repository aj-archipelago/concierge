/**
 * @jest-environment node
 */

/* eslint-disable import/first */

const mockAggregate = jest.fn();
const mockConnect = jest.fn();
const mockCollection = jest.fn(() => ({
    aggregate: mockAggregate,
}));

jest.mock("mongodb", () => ({
    MongoClient: jest.fn().mockImplementation(() => ({
        connect: mockConnect,
        db: () => ({
            collection: mockCollection,
        }),
    })),
}));

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => ({ body, init })),
    },
}));

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

import { getCurrentUser } from "../../utils/auth";

function createRequest(search = "") {
    return {
        nextUrl: new URL(`http://localhost/api/admin/usage${search}`),
    };
}

describe("admin usage route", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: "admin-1", role: "admin" });
        process.env.MONGO_URI = "mongodb://127.0.0.1:27017/test";
        mockAggregate.mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
        });
    });

    it("requires an admin user", async () => {
        getCurrentUser.mockResolvedValue({ _id: "user-1", role: "user" });
        const { GET } = await import("./route");

        const response = await GET(createRequest());

        expect(response.init).toEqual({ status: 403 });
        expect(mockCollection).not.toHaveBeenCalled();
    });

    it("filters raw usage through the indexed timestamp field", async () => {
        const { GET } = await import("./route");

        await GET(
            createRequest(
                "?startDate=2026-05-01T00%3A00%3A00.000Z&endDate=2026-05-08T00%3A00%3A00.000Z&groupBy=api_key_id",
            ),
        );

        const pipeline = mockAggregate.mock.calls[0][0];

        expect(pipeline[0]).toEqual({
            $match: {
                timestamp: {
                    $gte: new Date("2026-05-01T00:00:00.000Z"),
                    $lte: new Date("2026-05-08T00:00:00.000Z"),
                },
            },
        });
        expect(pipeline[0]).not.toHaveProperty("$addFields");
    });

    it("keeps provider total tokens separate from billable metered tokens", async () => {
        const { GET } = await import("./route");

        await GET(createRequest("?groupBy=api_key_id"));

        const pipeline = mockAggregate.mock.calls[0][0];
        const firstGroup = pipeline.find((stage) => stage.$group?._id?.model);
        const secondGroup = pipeline.find(
            (stage) => stage.$group?.model_breakdown,
        );
        const addFields = pipeline.find((stage) => stage.$addFields);

        expect(firstGroup.$group.total_tokens).toEqual({
            $sum: "$total_tokens",
        });
        expect(secondGroup.$group.total_tokens).toEqual({
            $sum: "$total_tokens",
        });
        expect(secondGroup.$group.model_breakdown.$push).toMatchObject({
            total_tokens: {
                $cond: [
                    { $gt: [{ $ifNull: ["$total_tokens", 0] }, 0] },
                    { $ifNull: ["$total_tokens", 0] },
                    {
                        $add: [
                            { $ifNull: ["$input_tokens", 0] },
                            { $ifNull: ["$output_tokens", 0] },
                        ],
                    },
                ],
            },
            metered_tokens: {
                $add: [
                    { $ifNull: ["$input_tokens", 0] },
                    { $ifNull: ["$output_tokens", 0] },
                    { $ifNull: ["$cache_creation_input_tokens", 0] },
                    { $ifNull: ["$cache_read_input_tokens", 0] },
                ],
            },
        });
        expect(addFields.$addFields).toHaveProperty("total_tokens");
        expect(addFields.$addFields).toHaveProperty("metered_tokens");
    });
});
