/** @jest-environment node */
import { deliverColleagueMessages } from "../colleague-delivery.js";
import { colleagueRequest } from "../../app/api/utils/colleagues.js";
import { publishColleagueMessage } from "../../app/api/utils/colleague-chat.js";
jest.mock("../../app/api/models/user.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(() => ({
            select: () => ({ lean: async () => ({ _id: "user" }) }),
        })),
    },
}));
jest.mock("../../app/api/utils/colleagues.js", () => ({
    colleagueRequest: jest.fn(),
}));
jest.mock("../../app/api/utils/colleague-chat.js", () => ({
    publishColleagueMessage: jest.fn(),
}));
beforeEach(() => {
    jest.clearAllMocks();
    colleagueRequest.mockResolvedValue({
        messages: [
            {
                _id: "message",
                owner: "context",
                entityId: "colleague",
                message: "Need a decision",
                kind: "help",
            },
        ],
    });
    publishColleagueMessage.mockResolvedValue({});
});
it("acknowledges only after durable inbox and chat delivery", async () => {
    await deliverColleagueMessages();
    expect(publishColleagueMessage).toHaveBeenCalledWith(
        { _id: "user" },
        expect.objectContaining({ kind: "help" }),
    );
    expect(colleagueRequest).toHaveBeenLastCalledWith("delivery", {
        acknowledgedIds: '["message"]',
    });
    expect(publishColleagueMessage.mock.invocationCallOrder[0]).toBeLessThan(
        colleagueRequest.mock.invocationCallOrder[1],
    );
});
it("leaves the outbox message for retry if delivery fails", async () => {
    publishColleagueMessage.mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(deliverColleagueMessages()).rejects.toThrow("DB unavailable");
    expect(colleagueRequest).toHaveBeenCalledTimes(1);
});
