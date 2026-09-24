/** @jest-environment node */
import { POST } from "./route";
import {
    readAgentToolsToken,
    runAgentToolOnce,
} from "../utils/agent-tool-capabilities.mjs";
import { executeColleagueTool } from "../utils/colleague-agent-tools";
jest.mock("../../../src/db.mjs", () => ({ connectToDatabase: jest.fn() }));
jest.mock("../models/user.mjs", () => ({
    __esModule: true,
    default: {
        findById: () => ({
            lean: async () => ({ _id: "owner", contextId: "context" }),
        }),
    },
}));
jest.mock("../utils/colleagues.js", () => ({
    requireColleague: async (_user, id) => ({ id }),
}));
jest.mock("../utils/agent-tool-capabilities.mjs", () => ({
    readAgentToolsToken: jest.fn(),
    runAgentToolOnce: jest.fn((_token, _call, action) => action()),
}));
jest.mock("../utils/colleague-agent-tools", () => ({
    executeColleagueTool: jest.fn(async () => Response.json({ success: true })),
}));
const request = (body = {}) =>
    new Request("http://localhost/api/agent-tools", {
        method: "POST",
        headers: {
            authorization: "Bearer token",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
beforeEach(() => {
    jest.clearAllMocks();
    readAgentToolsToken.mockResolvedValue({
        userId: "owner",
        contextId: "context",
        entityId: "rowan",
    });
});
it("rejects absent or expired capabilities without invoking tools", async () => {
    readAgentToolsToken.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(executeColleagueTool).not.toHaveBeenCalled();
});
it.each([
    { entityId: "finch", contextId: "context" },
    { entityId: "rowan", contextId: "foreign" },
])("rejects identity changes in the request body", async (body) => {
    expect((await POST(request(body))).status).toBe(403);
    expect(executeColleagueTool).not.toHaveBeenCalled();
});
it("executes only under the identity stored in the capability", async () => {
    expect(
        (
            await POST(
                request({
                    entityId: "rowan",
                    contextId: "context",
                    tool: "readcolleaguesettings",
                    callId: "request:call",
                }),
            )
        ).status,
    ).toBe(200);
    expect(runAgentToolOnce).toHaveBeenCalled();
    expect(executeColleagueTool).toHaveBeenCalledWith(
        expect.objectContaining({
            user: { _id: "owner", contextId: "context" },
            entity: { id: "rowan" },
        }),
    );
});
