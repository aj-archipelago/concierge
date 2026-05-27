/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../../models/feedback", () => ({
    findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

import Feedback from "../../../models/feedback";
import { getCurrentUser } from "../../../utils/auth";
import { PATCH } from "./route";

function makeRequest(body) {
    return {
        json: jest.fn().mockResolvedValue(body),
    };
}

function mockFeedbackQuery(result) {
    const query = {
        populate: jest.fn(() => query),
        then: (resolve) => Promise.resolve(resolve(result)),
    };
    return query;
}

describe("PATCH /api/admin/feedback/[id]", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("requires an admin user", async () => {
        getCurrentUser.mockResolvedValue({ _id: "user-1", role: "user" });

        const response = await PATCH(makeRequest({ status: "resolved" }), {
            params: { id: "feedback-1" },
        });

        expect(response.status).toBe(403);
        expect(Feedback.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("marks feedback resolved with resolver metadata", async () => {
        getCurrentUser.mockResolvedValue({ _id: "admin-1", role: "admin" });
        Feedback.findByIdAndUpdate.mockReturnValue(
            mockFeedbackQuery({
                _id: "feedback-1",
                status: "resolved",
                resolvedBy: "admin-1",
            }),
        );

        const response = await PATCH(makeRequest({ status: "resolved" }), {
            params: { id: "feedback-1" },
        });

        expect(response.status).toBe(200);
        expect(Feedback.findByIdAndUpdate).toHaveBeenCalledWith(
            "feedback-1",
            expect.objectContaining({
                $set: expect.objectContaining({
                    status: "resolved",
                    resolvedBy: "admin-1",
                    resolvedAt: expect.any(Date),
                }),
            }),
            { new: true },
        );
    });

    it("reopens feedback by clearing resolver metadata", async () => {
        getCurrentUser.mockResolvedValue({ _id: "admin-1", role: "admin" });
        Feedback.findByIdAndUpdate.mockReturnValue(
            mockFeedbackQuery({
                _id: "feedback-1",
                status: "open",
            }),
        );

        const response = await PATCH(makeRequest({ status: "open" }), {
            params: { id: "feedback-1" },
        });

        expect(response.status).toBe(200);
        expect(Feedback.findByIdAndUpdate).toHaveBeenCalledWith(
            "feedback-1",
            {
                $set: { status: "open" },
                $unset: {
                    resolvedAt: 1,
                    resolvedBy: 1,
                },
            },
            { new: true },
        );
    });
});
