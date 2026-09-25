/** @jest-environment node */
import { buildDigestBlock } from "../../digest-build.js";
import handler from "../build-digest.mjs";

jest.mock("../../digest-build.js", () => ({ buildDigestBlock: jest.fn() }));
jest.mock("../../logger.js", () => ({
    Logger: jest.fn(() => ({ log: jest.fn() })),
}));
const job = {
    data: { userId: "user", taskId: "task", metadata: { blockId: "block" } },
};

it("propagates failed generation so the task executor marks the task failed", async () => {
    buildDigestBlock.mockResolvedValue({
        success: false,
        error: "Gateway timeout",
    });
    await expect(handler.startRequest(job)).rejects.toThrow("Gateway timeout");
    expect(handler.isRetryable).toBe(false);
});

it("completes successful and skipped automation-linked builds", async () => {
    buildDigestBlock.mockResolvedValue({ success: true });
    await expect(handler.startRequest(job)).resolves.toBeUndefined();
    buildDigestBlock.mockResolvedValue({ success: true, skipped: true });
    await expect(handler.startRequest(job)).resolves.toBeUndefined();
});
