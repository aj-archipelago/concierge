/** @jest-environment node */
import handler from "../media-generation.mjs";
import User from "../../../app/api/models/user.mjs";

jest.mock("../../graphql.mjs", () => ({
    MEDIA_GENERATE: "generate",
    MEDIA_PROMPT_TAGS: "tags",
    SYS_MODEL_METADATA: "metadata",
}));
jest.mock("../../../app/api/models/user.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../../../app/api/models/media-item.mjs", () => ({
    __esModule: true,
    default: {},
}));

describe("media generation storage identity", () => {
    beforeEach(() => jest.clearAllMocks());
    it("uses the job owner rather than metadata or model settings", async () => {
        User.findById.mockReturnValue({
            select: () => ({
                lean: async () => ({ contextId: "actual-owner" }),
            }),
        });
        const query = jest
            .fn()
            .mockResolvedValueOnce({
                data: { sys_model_metadata: { result: "{}" } },
            })
            .mockResolvedValue({
                data: { media_generate: { result: "request-id" } },
            });
        const job = {
            data: {
                userId: "user-1",
                taskId: "task-1",
                metadata: {
                    prompt: "Test image",
                    outputType: "image",
                    model: "gemini-pro-3-image",
                    contextId: "other-owner",
                    settings: { contextId: "other-owner" },
                },
            },
            client: { query },
        };
        await handler.startRequest(job);
        expect(User.findById).toHaveBeenCalledWith("user-1");
        expect(query.mock.calls.at(-1)[0].variables.contextId).toBe(
            "actual-owner",
        );
    });
    it("rejects missing owner context before provider submission", async () => {
        User.findById.mockReturnValue({
            select: () => ({ lean: async () => null }),
        });
        const query = jest.fn();
        await expect(
            handler.startRequest({
                data: { userId: "missing", metadata: {} },
                client: { query },
            }),
        ).rejects.toMatchObject({ code: "MEDIA_STORAGE_CONTEXT_REQUIRED" });
        expect(query).not.toHaveBeenCalled();
    });
});
