/** @jest-environment node */
import { GET, PATCH } from "./route.js";
import Digest from "../../../models/digest";
import { enqueueBuildDigest } from "./utils";
import {
    mergeDigestEdit,
    updateDigestBlocks,
} from "../../../utils/digest-store.mjs";
jest.mock("next/server", () => ({
    NextResponse: { json: (data, options) => ({ data, ...options }) },
}));
jest.mock("../../../utils/auth", () => ({
    getCurrentUser: async () => ({ _id: "owner" }),
}));
jest.mock("../../../models/digest", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock("../../../automations/utils", () => ({
    scheduleAutomationRefIdBackfill: jest.fn(),
}));
jest.mock("./utils", () => ({ enqueueBuildDigest: jest.fn() }));
jest.mock("../../../utils/digest-store.mjs", () => ({
    ...jest.requireActual("../../../utils/digest-store.mjs"),
    updateDigestBlocks: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());
it("reads an existing digest without writing or enqueueing", async () => {
    const data = {
        blocks: [{ _id: "card", prompt: "Custom", content: "saved" }],
    };
    Digest.findOne.mockResolvedValue({ ...data, toJSON: () => data });
    expect((await GET()).data).toEqual(data);
    expect(Digest.findOneAndUpdate).not.toHaveBeenCalled();
    expect(enqueueBuildDigest).not.toHaveBeenCalled();
});
it("creates no hidden news card or model request for a new account", async () => {
    Digest.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ toJSON: () => ({ blocks: [] }) });
    Digest.findOneAndUpdate.mockResolvedValue({ blocks: [] });
    expect((await GET()).data.blocks).toEqual([]);
    expect(
        Digest.findOneAndUpdate.mock.calls[0][1].$setOnInsert.blocks,
    ).toEqual([]);
    expect(enqueueBuildDigest).not.toHaveBeenCalled();
});
it("merges an edit without accepting stale generated content or runtime markers from the client", () => {
    const current = [
        {
            _id: "card",
            title: "Old",
            prompt: "P",
            content: "new result",
            taskId: "real",
            updatedAt: "current",
        },
    ];
    const edited = mergeDigestEdit(current, [
        {
            _id: "card",
            title: "Renamed",
            prompt: "P",
            content: "stale",
            taskId: "forged",
        },
    ]);
    expect(edited[0]).toMatchObject({
        title: "Renamed",
        content: "new result",
        taskId: "real",
        updatedAt: "current",
    });
});
it("invalidates the old generation on a prompt edit and retains the last good content", () => {
    const current = [
        {
            _id: "card",
            prompt: "Old",
            content: "saved",
            taskId: "old-task",
            generationKey: "v1",
        },
    ];
    expect(
        mergeDigestEdit(current, [
            { _id: "card", prompt: "New", generationKey: "v2" },
        ])[0],
    ).toMatchObject({
        prompt: "New",
        content: "saved",
        generationKey: "v2",
        taskId: null,
    });
});
it("does not resurrect a deleted digest while patching", async () => {
    updateDigestBlocks.mockResolvedValue(null);
    const result = await PATCH({ json: async () => ({ blocks: [] }) });
    expect(result.status).toBe(404);
    expect(enqueueBuildDigest).not.toHaveBeenCalled();
});
