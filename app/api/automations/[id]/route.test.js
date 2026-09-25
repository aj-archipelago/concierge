/** @jest-environment node */
import { PUT } from "./route";
import { requireColleague } from "../../utils/colleagues";
import { findAutomationForEditor } from "../utils";

jest.mock("../../utils/auth", () => ({
    getCurrentUser: async () => ({
        _id: "editor",
        contextId: "editor-context",
    }),
    handleError: (error) =>
        new Response(JSON.stringify({ error: error.message }), { status: 500 }),
}));
jest.mock("../../models/automation", () => ({}));
jest.mock("../../models/digest.mjs", () => ({}));
jest.mock("../../utils/shareHelpers", () => ({}));
jest.mock("../../utils/colleagues", () => ({
    requireColleague: jest.fn(),
    validateTaskWatch: jest.fn(),
}));
jest.mock("../utils", () => ({
    findAutomationForEditor: jest.fn(),
    resolveAutomationStorageContextId: async () => "owner-context",
    automationEffectiveEnabled: () => false,
    serializeAutomation: (automation) => ({ name: automation.name }),
}));

beforeEach(() => jest.clearAllMocks());

it("allows a shared task editor to retain the owner's file-watching colleague", async () => {
    const save = jest.fn();
    findAutomationForEditor.mockResolvedValue({
        automation: {
            name: "Watch source files",
            entityId: "owner-colleague",
            schedule: { frequency: "files", watchPath: "/workspace/source" },
            markModified: jest.fn(),
            save,
        },
        isOwner: false,
        role: "editor",
    });
    const response = await PUT(
        { json: async () => ({ name: "Updated title" }) },
        { params: { id: "task" } },
    );
    expect(response.status).toBe(200);
    expect(requireColleague).toHaveBeenCalledWith(
        { contextId: "owner-context" },
        "owner-colleague",
        { watch: true },
    );
    expect(save).toHaveBeenCalled();
});

it("still prevents an editor from reassigning the owner's colleague", async () => {
    findAutomationForEditor.mockResolvedValue({
        automation: { entityId: "owner-colleague" },
        isOwner: false,
        role: "editor",
    });
    const response = await PUT(
        { json: async () => ({ entityId: "editor-colleague" }) },
        { params: { id: "task" } },
    );
    expect(response.status).toBe(403);
    expect(requireColleague).not.toHaveBeenCalled();
});

it.each([-1, 1.5, "30", 1001, null])(
    "rejects invalid retention values (%p)",
    async (retainedRuns) => {
        const save = jest.fn();
        findAutomationForEditor.mockResolvedValue({
            automation: { save },
            isOwner: true,
        });
        const response = await PUT(
            { json: async () => ({ retainedRuns }) },
            { params: { id: "task" } },
        );
        expect(response.status).toBe(400);
        expect(save).not.toHaveBeenCalled();
    },
);

it("only lets the owner change retention", async () => {
    findAutomationForEditor.mockResolvedValue({
        automation: { retainedRuns: 30 },
        isOwner: false,
    });
    const response = await PUT(
        { json: async () => ({ retainedRuns: 10 }) },
        { params: { id: "task" } },
    );
    expect(response.status).toBe(403);
});
