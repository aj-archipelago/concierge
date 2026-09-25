/** @jest-environment node */
import {
    colleagueRequest,
    requireColleague,
    validateTaskWatch,
} from "../colleagues.js";
const originalFetch = global.fetch;
beforeEach(() => {
    global.fetch = jest.fn();
});
afterAll(() => {
    global.fetch = originalFetch;
});
function response(colleagues) {
    global.fetch.mockImplementation(async (_url, request) => ({
        ok: true,
        json: async () => ({
            data: {
                sys_colleagues: {
                    result: JSON.stringify(
                        colleagues.find(
                            (c) =>
                                c.id ===
                                JSON.parse(request.body).variables.entityId,
                        ) || { error: "Colleague not found" },
                    ),
                },
            },
        }),
    }));
}
it("rejects missing, archived, and paused execution targets instead of using a default entity", async () => {
    response([
        { id: "a", status: "archived" },
        { id: "p", status: "paused" },
    ]);
    await expect(
        requireColleague({ contextId: "owner" }, "other"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
        requireColleague({ contextId: "owner" }, "a"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
        requireColleague({ contextId: "owner" }, "p", { runnable: true }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
        requireColleague({ contextId: "owner" }, "p"),
    ).resolves.toMatchObject({ id: "p" });
});
it("does not accept GraphQL errors as a successful operation", async () => {
    global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ errors: [{ message: "schema unavailable" }] }),
    });
    await expect(
        colleagueRequest("manage", { userId: "owner" }),
    ).rejects.toThrow("unavailable");
});
it("requires a colleague and a bounded workspace path for file triggers", () => {
    for (const watchPath of [
        "/workspace",
        "/cloud-files",
        "/workspace/.env",
        "/workspace/a/../b",
        "/workspace/files/input",
    ])
        expect(() =>
            validateTaskWatch({ frequency: "files", watchPath }, "a"),
        ).toThrow();
    expect(() =>
        validateTaskWatch(
            { frequency: "files", watchPath: "/workspace/inbox" },
            null,
        ),
    ).toThrow();
    expect(() =>
        validateTaskWatch(
            { frequency: "files", watchPath: "/workspace/inbox" },
            "a",
        ),
    ).not.toThrow();
    expect(() => validateTaskWatch({ frequency: "daily" }, null)).not.toThrow();
});

it("keeps an unavailable colleague target instead of silently selecting the personal assistant", async () => {
    const { resolveChatEntitySelection } = await import(
        "../../chats/_lib/resolveChatEntitySelection.js"
    );
    const result = await resolveChatEntitySelection({
        graphqlClient: {
            query: async () => ({
                data: {
                    sys_get_entities: {
                        result: JSON.stringify([{ id: "personal" }]),
                    },
                },
            }),
        },
        currentUser: { contextId: "user", personalEntityId: "personal" },
        requestedEntityId: "colleague-missing",
        persistedEntityId: "colleague-missing",
        getEntitiesQuery: {},
    });
    expect(result.entityId).toBe("colleague-missing");
});
