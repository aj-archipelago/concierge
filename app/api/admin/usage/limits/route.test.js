/** @jest-environment node */
import { GET, PATCH } from "./route";
import { describeBudget, DEFAULT_WEEKLY_USD } from "./budgets";
const mockUser = jest.fn();
const mockUpdate = jest.fn();
const mockGetDb = jest.fn();
jest.mock("../../../utils/auth", () => ({ getCurrentUser: () => mockUser() }));
jest.mock("../database", () => ({ getUsageDatabase: () => mockGetDb() }));
jest.mock("next/server", () => ({
    NextResponse: { json: (body, init) => ({ body, init }) },
}));
const body = { apiKeyId: "000000000001", weeklyUsd: 500 };
const request = (value) => ({
    json: async () => value,
    headers: new Headers({ origin: "https://example.test" }),
    nextUrl: new URL("https://example.test/api/admin/usage/limits"),
});
beforeEach(() => {
    jest.clearAllMocks();
    mockUser.mockResolvedValue({ _id: "admin", role: "admin" });
    mockUpdate.mockResolvedValue({});
    mockGetDb.mockResolvedValue({
        collection: () => ({ updateOne: mockUpdate }),
    });
});
it("defaults to unlimited", () => expect(DEFAULT_WEEKLY_USD).toBeNull());
it("reports the actual snapshot time and never invents a zero for missing snapshots", async () => {
    const policy = {
        _id: body.apiKeyId,
        weeklyUsd: 500,
        anchorAt: new Date("2026-06-01T12:00:00Z"),
    };
    const snapshotAt = new Date("2026-09-12T00:00:00Z");
    const snapshot = {
        _id: describeBudget(policy).periodId,
        spentMicros: 125_000_000,
        requests: 20,
        snapshotAt,
    };
    const find = jest.fn(() => ({
        limit: () => ({ toArray: async () => [policy] }),
    }));
    mockGetDb.mockResolvedValue({
        collection: (name) =>
            name === "api_key_cost_limits"
                ? { find }
                : { find: () => ({ toArray: async () => [snapshot] }) },
    });
    const result = await GET();
    expect(result.body.budgets[body.apiKeyId]).toMatchObject({
        spentUsd: 125,
        hasSnapshot: true,
        snapshotAt: snapshotAt.toISOString(),
    });
    expect(result.body.truncated).toBe(false);
    expect(result.body.generatedAt).toBeTruthy();
    expect(find.mock.calls[0][1].projection).toHaveProperty("updatedAt", 1);
    expect(describeBudget(policy).spentUsd).toBeNull();
});
it("requires admin to read policies", async () => {
    mockUser.mockResolvedValue({ role: "user" });
    expect((await GET()).init.status).toBe(403);
    expect(mockGetDb).not.toHaveBeenCalled();
});
it("requires admin for mutations", async () => {
    mockUser.mockResolvedValue({ role: "user" });
    expect((await PATCH(request(body))).init.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
});
it.each([-1, "500", 500.001, Infinity, undefined])(
    "rejects invalid cap %p",
    async (weeklyUsd) => {
        expect((await PATCH(request({ ...body, weeklyUsd }))).init.status).toBe(
            400,
        );
    },
);
it.each([0, 500, null])(
    "supports %p without resetting the current allowance",
    async (weeklyUsd) => {
        await PATCH(request({ ...body, weeklyUsd }));
        const update = mockUpdate.mock.calls[0][1];
        expect(update.$set.weeklyUsd).toBe(weeklyUsd);
        expect(update.$set).not.toHaveProperty("anchorAt");
        expect(update).not.toHaveProperty("$unset");
    },
);
it("rejects a cross-origin update", async () => {
    const req = request(body);
    req.headers.set("origin", "https://attacker.test");
    expect((await PATCH(req)).init.status).toBe(403);
    expect(mockGetDb).not.toHaveBeenCalled();
});
it.each([0, 125.5, null])(
    "saves cap %p behind the HTTPS ingress without resetting spend",
    async (weeklyUsd) => {
        const req = request({ ...body, weeklyUsd });
        req.nextUrl = new URL("http://0.0.0.0:8080/api/admin/usage/limits");
        req.headers.set("host", "internal.azurewebsites.net");
        req.headers.set("x-forwarded-host", "concierge.example.com");
        req.headers.set("x-forwarded-proto", "https");
        req.headers.set("origin", "https://concierge.example.com");

        expect((await PATCH(req)).body).toEqual({ ...body, weeklyUsd });
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(mockUpdate.mock.calls[0][1].$set).toEqual({
            weeklyUsd,
            updatedAt: expect.any(Date),
            updatedBy: "admin",
        });
    },
);
it("uses the incoming Host when Next.js has the container URL", async () => {
    const req = request(body);
    req.nextUrl = new URL("http://0.0.0.0:8080/api/admin/usage/limits");
    req.headers.set("host", "example.test");
    req.headers.set("x-forwarded-proto", "https");
    expect((await PATCH(req)).body).toEqual(body);
});
it.each([
    "https://attacker.test",
    "http://example.test",
    "https://example.test:8443",
    "null",
    "not a URL",
    "https://example.test/path",
    "https://attacker.test@example.test",
])("rejects invalid or cross-origin %s behind the proxy", async (origin) => {
    const req = request(body);
    req.nextUrl = new URL("http://0.0.0.0:8080/api/admin/usage/limits");
    req.headers.set("x-forwarded-host", "example.test");
    req.headers.set("x-forwarded-proto", "https");
    req.headers.set("origin", origin);
    expect((await PATCH(req)).init.status).toBe(403);
    expect(mockGetDb).not.toHaveBeenCalled();
});
it.each([
    ["x-forwarded-host", "example.test, attacker.test"],
    ["x-forwarded-host", "example.test/path"],
    ["x-forwarded-host", "attacker.test@example.test"],
    ["x-forwarded-proto", "https, http"],
    ["x-forwarded-proto", "file"],
])("rejects an ambiguous or malformed %s", async (header, value) => {
    const req = request(body);
    req.headers.set(header, value);
    expect((await PATCH(req)).init.status).toBe(403);
    expect(mockGetDb).not.toHaveBeenCalled();
});
it("allows authenticated server requests without an Origin header", async () => {
    const req = request(body);
    req.headers.delete("origin");
    expect((await PATCH(req)).body).toEqual(body);
});
it("calculates the next reset after an idle week without requiring cron", () => {
    const result = describeBudget(
        {
            _id: body.apiKeyId,
            weeklyUsd: 500,
            anchorAt: new Date("2026-06-01T12:00:00Z"),
        },
        null,
        new Date("2026-06-16T12:00:00Z"),
    );
    expect(result.periodStart).toBe("2026-06-15T12:00:00.000Z");
    expect(result.resetAt).toBe("2026-06-22T12:00:00.000Z");
    expect(result.spentUsd).toBeNull();
    expect(result.hasSnapshot).toBe(false);
});

it("retries a race with first admission without resetting its anchor", async () => {
    mockUpdate.mockRejectedValueOnce(
        Object.assign(new Error("duplicate"), { code: 11000 }),
    );
    const result = await PATCH(request(body));
    expect(result.body.weeklyUsd).toBe(500);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][1].$set).not.toHaveProperty("anchorAt");
});
