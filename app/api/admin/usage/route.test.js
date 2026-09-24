/** @jest-environment node */
import { GET } from "./route";
const mockUser = jest.fn();
const mockCollection = {};
const mockGetCollection = jest.fn();
const mockQuery = jest.fn();
jest.mock("../../utils/auth", () => ({
    getCurrentUser: () => mockUser(),
    handleError: jest.fn(),
}));
jest.mock("./database", () => ({
    getTokenUsageCollection: () => mockGetCollection(),
}));
jest.mock("./usageQuery", () => ({
    ...jest.requireActual("./usageQuery"),
    queryUsage: (...args) => mockQuery(...args),
}));
jest.mock("next/server", () => ({
    NextResponse: { json: (body, init) => ({ body, init }) },
}));
const request = (query) => ({
    nextUrl: new URL(`http://localhost/api/admin/usage?${query}`),
});
beforeEach(() => {
    jest.clearAllMocks();
    mockUser.mockResolvedValue({ role: "admin" });
    mockGetCollection.mockResolvedValue(mockCollection);
    mockQuery.mockResolvedValue({ byModel: [], byKey: [], byDay: [] });
});
it("requires an administrator before touching usage data", async () => {
    mockUser.mockResolvedValue({ role: "user" });
    expect((await GET(request(""))).init.status).toBe(403);
    expect(mockGetCollection).not.toHaveBeenCalled();
});
it.each([
    "startDate=invalid",
    "startDate=2026-01-01&endDate=2026-05-01",
    "groupBy=unsupported",
    "startDate=2026-06-02&endDate=2026-06-01",
])("rejects an invalid or unbounded query: %s", async (query) => {
    expect((await GET(request(query))).init.status).toBe(400);
    expect(mockGetCollection).not.toHaveBeenCalled();
});
it("serves one consistent overview rather than three independent aggregates", async () => {
    const response = await GET(
        request("startDate=2026-06-01&endDate=2026-06-08&groupBy=overview"),
    );
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
        mockCollection,
        expect.objectContaining({ groupBy: "overview" }),
    );
    expect(response.body).toEqual({ byModel: [], byKey: [], byDay: [] });
    expect(response.init.headers["Cache-Control"]).toBe("private, no-store");
});
it("returns an explicit failure instead of incomplete totals", async () => {
    mockQuery.mockRejectedValue(new Error("database query failed"));
    const response = await GET(request(""));
    expect(response.init.status).toBe(503);
    expect(response.body.error).toBeTruthy();
});
