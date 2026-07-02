/**
 * @jest-environment node
 */

import { computeIsShared, legacyHydratedShareShape } from "../shareHelpers.js";

describe("shareHelpers", () => {
    describe("computeIsShared", () => {
        it("treats legacy public chats as shared", () => {
            expect(computeIsShared(null, { legacyPublic: true })).toBe(true);
        });

        it("treats link-enabled share docs as shared", () => {
            expect(
                computeIsShared(
                    { link: { enabled: true }, recipients: [] },
                    { legacyPublic: false },
                ),
            ).toBe(true);
        });

        it("treats recipient-only share docs as shared", () => {
            expect(
                computeIsShared(
                    {
                        link: { enabled: false },
                        recipients: [{ userId: "abc", role: "viewer" }],
                    },
                    { legacyPublic: false },
                ),
            ).toBe(true);
        });

        it("returns false when neither legacy nor share doc is active", () => {
            expect(
                computeIsShared(
                    { link: { enabled: false }, recipients: [] },
                    { legacyPublic: false },
                ),
            ).toBe(false);
        });
    });

    describe("legacyHydratedShareShape", () => {
        it("maps legacy public flags to an enabled viewer link", () => {
            expect(
                legacyHydratedShareShape("chat", "507f1f77bcf86cd799439011"),
            ).toEqual({
                entityType: "chat",
                entityId: "507f1f77bcf86cd799439011",
                link: { enabled: true, role: "viewer" },
                recipients: [],
            });
        });
    });
});
