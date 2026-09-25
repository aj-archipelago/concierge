/** @jest-environment node */
import { GET } from "./route";
const mockUser = jest.fn();
const mockFind = jest.fn();
jest.mock("../../../utils/auth", () => ({
    getCurrentUser: () => mockUser(),
    handleError: () => ({ init: { status: 500 } }),
}));
jest.mock("../../../models/apiKeyMapping.mjs", () => ({
    __esModule: true,
    default: { find: (...args) => mockFind(...args) },
}));
jest.mock("next/server", () => ({
    NextResponse: { json: (body, init) => ({ body, init }) },
}));
beforeEach(() => {
    jest.clearAllMocks();
    mockUser.mockResolvedValue({ role: "admin" });
    mockFind.mockReturnValue({
        lean: async () => [{ apiKeyHash: "000000000001", label: "Example" }],
    });
});
it("does not expose key ownership labels to ordinary authenticated users", async () => {
    mockUser.mockResolvedValue({ role: "user" });
    expect((await GET()).init.status).toBe(403);
    expect(mockFind).not.toHaveBeenCalled();
});
it("returns only fingerprints and labels to admins without public caching", async () => {
    const result = await GET();
    expect(result.body).toEqual({ "000000000001": "Example" });
    expect(result.init.headers["Cache-Control"]).toBe("private, no-store");
});
