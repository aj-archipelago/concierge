import {
    isShareActive,
    shareEntityUrl,
    ownedSharesQueryKey,
} from "../shareUtils";

describe("isShareActive", () => {
    it("returns true for legacy shared resources", () => {
        expect(isShareActive(null, { legacyShared: true })).toBe(true);
    });

    it("returns true when link sharing is enabled", () => {
        expect(
            isShareActive({
                link: { enabled: true, role: "viewer" },
                recipients: [],
            }),
        ).toBe(true);
    });

    it("returns true when recipients exist", () => {
        expect(
            isShareActive({
                link: { enabled: false, role: "viewer" },
                recipients: [{ userId: "user-1", role: "viewer" }],
            }),
        ).toBe(true);
    });

    it("returns false for default share settings", () => {
        expect(
            isShareActive({
                link: { enabled: false, role: "viewer" },
                recipients: [],
            }),
        ).toBe(false);
    });
});

describe("shareEntityUrl", () => {
    it("builds resource URLs for supported entity types", () => {
        expect(shareEntityUrl("chat", "abc")).toBe("/chat/abc");
        expect(shareEntityUrl("automation", "xyz")).toBe("/automations/xyz");
    });

    it("returns null for unsupported entity types", () => {
        expect(shareEntityUrl("skill", "abc")).toBeNull();
    });
});

describe("ownedSharesQueryKey", () => {
    it("returns a stable query key", () => {
        expect(ownedSharesQueryKey()).toEqual(["shares", "owned"]);
    });
});
