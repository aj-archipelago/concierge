import { buildAppletViewMeta } from "../appletViewMeta";

describe("buildAppletViewMeta", () => {
    it("returns null when user or owner is missing", () => {
        expect(buildAppletViewMeta("owner1", null)).toBeNull();
        expect(buildAppletViewMeta(null, { _id: "user1" })).toBeNull();
    });

    it("marks admins as able to copy applets they do not own", () => {
        expect(
            buildAppletViewMeta("owner1", { _id: "admin1", role: "admin" }),
        ).toEqual({
            isOwner: false,
            canAdminCopy: true,
        });
    });

    it("disables admin copy for applets the admin already owns", () => {
        expect(
            buildAppletViewMeta("admin1", { _id: "admin1", role: "admin" }),
        ).toEqual({
            isOwner: true,
            canAdminCopy: false,
        });
    });
});
