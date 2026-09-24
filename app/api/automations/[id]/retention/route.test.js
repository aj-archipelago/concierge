/** @jest-environment node */
import { GET, POST } from "./route.js";
import { findAutomationForUser } from "../../utils.js";
import { pruneAutomationOutputs } from "../../../utils/automation-retention.mjs";
jest.mock("../../../utils/auth.js", () => ({
    getCurrentUser: async () => ({ _id: "viewer" }),
    handleError: () => new Response("", { status: 500 }),
}));
jest.mock("../../utils.js", () => ({ findAutomationForUser: jest.fn() }));
jest.mock("../../../utils/automation-retention.mjs", () => ({
    pruneAutomationOutputs: jest.fn(),
}));
beforeEach(() => jest.resetAllMocks());
it.each([GET, POST])(
    "does not expose or prune another owner’s task",
    async (handler) => {
        findAutomationForUser.mockResolvedValue(null);
        expect(
            (
                await handler(new Request("http://localhost"), {
                    params: { id: "other" },
                })
            ).status,
        ).toBe(404);
        expect(findAutomationForUser).toHaveBeenCalledWith("other", "viewer");
        expect(pruneAutomationOutputs).not.toHaveBeenCalled();
    },
);
it.each([
    [GET, true],
    [POST, false],
])(
    "binds preview and cleanup to the authenticated owner",
    async (handler, dryRun) => {
        findAutomationForUser.mockResolvedValue({ _id: "task" });
        pruneAutomationOutputs.mockResolvedValue({ keep: 30, candidates: [] });
        expect(
            (
                await handler(new Request("http://localhost"), {
                    params: Promise.resolve({ id: "task" }),
                })
            ).status,
        ).toBe(200);
        expect(pruneAutomationOutputs).toHaveBeenCalledWith("task", {
            ownerId: "viewer",
            dryRun,
        });
    },
);
