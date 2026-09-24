/** @jest-environment node */
import { executeColleagueTool } from "../colleague-agent-tools";
import { getAgentToolUser } from "../agent-tool-context.mjs";
import * as list from "../../automations/route";
import * as detail from "../../automations/[id]/route";
import * as run from "../../automations/[id]/run/route";
import { PATCH } from "../../colleagues/[id]/route";
import { publishColleagueMessage } from "../colleague-chat.js";
jest.mock("../colleague-chat.js", () => ({
    publishColleagueMessage: jest.fn(),
}));
jest.mock("../../automations/route", () => ({
    GET: jest.fn(),
    POST: jest.fn(),
}));
jest.mock("../../automations/[id]/route", () => ({
    GET: jest.fn(),
    PUT: jest.fn(),
    DELETE: jest.fn(),
}));
jest.mock("../../automations/[id]/runs/route", () => ({ GET: jest.fn() }));
jest.mock("../../automations/[id]/run/route", () => ({ POST: jest.fn() }));
jest.mock("../../colleagues/[id]/route", () => ({ PATCH: jest.fn() }));
const user = {
        _id: "owner",
        contextId: "context",
        personalEntityId: "personal",
    },
    entity = { id: "rowan" };
const call = (tool, args = {}) =>
    executeColleagueTool({ user, entity, tool, args });
beforeEach(() => {
    jest.clearAllMocks();
    list.GET.mockImplementation(async () =>
        Response.json({
            automations: [
                {
                    _id: "mine",
                    owner: "owner",
                    entityId: "rowan",
                    slug: "daily",
                },
                { _id: "other", owner: "owner", entityId: "finch" },
                { _id: "legacy", owner: "owner" },
            ],
        }),
    );
});
it("creates as the executing colleague even if parameters try to replace the entity", async () => {
    list.POST.mockImplementation(async (request) =>
        Response.json(
            { payload: await request.json(), actor: getAgentToolUser()._id },
            { status: 201 },
        ),
    );
    const response = await call("createautomation", {
        name: "Daily",
        entityId: "personal",
        owner: "intruder",
    });
    expect(await response.json()).toEqual({
        payload: { name: "Daily", entityId: "rowan" },
        actor: "owner",
    });
    expect(getAgentToolUser()).toBeUndefined();
});
it("lists only assigned tasks and rejects another colleague task before reading or running it", async () => {
    expect(
        (await (await call("listautomations")).json()).automations.map(
            (t) => t._id,
        ),
    ).toEqual(["mine"]);
    expect((await call("runautomation", { idOrSlug: "other" })).status).toBe(
        404,
    );
    expect(run.POST).not.toHaveBeenCalled();
    expect(detail.GET).not.toHaveBeenCalled();
});
it("preserves assignment when changing a schedule", async () => {
    detail.PUT.mockImplementation(async (request) =>
        Response.json(await request.json()),
    );
    expect(
        await (
            await call("updateautomation", {
                idOrSlug: "daily",
                enabled: false,
                entityId: "personal",
            })
        ).json(),
    ).toEqual({ enabled: false });
});
it("only updates the current entity settings with explicitly supplied fields", async () => {
    PATCH.mockImplementation(async (request, options) =>
        Response.json({ settings: await request.json(), ...options }),
    );
    expect(
        await (
            await call("updatecolleaguesettings", {
                name: "Noor",
                entityId: "finch",
                tools: ["evil"],
            })
        ).json(),
    ).toEqual({ settings: { name: "Noor" }, params: { id: "rowan" } });
});
it("keeps legacy unassigned tasks with the personal entity", async () => {
    const response = await executeColleagueTool({
        user,
        entity: { id: "personal" },
        tool: "listautomations",
        args: {},
    });
    expect((await response.json()).automations.map((t) => t._id)).toEqual([
        "legacy",
    ]);
});

it("delivers a notification under the bound identity and stable operation ID", async () => {
    publishColleagueMessage.mockResolvedValue({
        metadata: { chatId: "thread" },
    });
    const response = await executeColleagueTool({
        user,
        entity: { id: "shared", name: "Specialist" },
        tool: "notifyuser",
        operationId: "server-bound-call",
        args: {
            message: "  Please choose a source  ",
            kind: "help",
            owner: "intruder",
            entityId: "other",
            operationId: "forged",
            url: "/automations/task/runs/result",
        },
    });
    expect(publishColleagueMessage).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
            _id: "server-bound-call",
            entityId: "shared",
            name: "Specialist",
            message: "Please choose a source",
            kind: "help",
            url: "/automations/task/runs/result",
        }),
    );
    expect(await response.json()).toEqual({
        success: true,
        delivery: "inbox",
        chatId: "thread",
    });
});

it.each([
    { message: "", kind: "help" },
    { message: "x".repeat(8001), kind: "result" },
    { message: "Hello", kind: "broadcast" },
    { message: "Hello", kind: "result", url: "javascript:alert(1)" },
])("rejects invalid inbox content before delivery", async (args) => {
    const response = await executeColleagueTool({
        user,
        entity,
        tool: "notifyuser",
        args,
        operationId: "server-call",
    });
    expect(response.status).toBe(400);
    expect(publishColleagueMessage).not.toHaveBeenCalled();
});
