/**
 * @jest-environment node
 */

import { Buffer } from "buffer";
import {
    isTenantAuthorized,
    parseAuthorizedTenantIds,
    resolveEntraPrincipalDisplayName,
    resolveEntraTenantId,
    resolveEntraPrincipalEmail,
} from "./entraPrincipal";

const encodePrincipal = (claims) =>
    Buffer.from(JSON.stringify({ claims }), "utf8").toString("base64");

describe("entraPrincipal", () => {
    test("resolves preferred_username when principal name is not an email", () => {
        const headers = new Map([
            [
                "X-MS-CLIENT-PRINCIPAL-NAME",
                "33333333-3333-4333-8333-333333333333",
            ],
            [
                "X-MS-CLIENT-PRINCIPAL",
                encodePrincipal([
                    {
                        typ: "preferred_username",
                        val: "user@example.test",
                    },
                ]),
            ],
        ]);

        expect(resolveEntraPrincipalEmail(headers)).toBe("user@example.test");
    });

    test("keeps principal name when it is already an email", () => {
        const headers = new Map([
            ["X-MS-CLIENT-PRINCIPAL-NAME", "user@example.test"],
        ]);

        expect(resolveEntraPrincipalEmail(headers)).toBe("user@example.test");
    });

    test("resolves a display name from the Entra name claim", () => {
        const headers = new Map([
            [
                "X-MS-CLIENT-PRINCIPAL",
                encodePrincipal([{ typ: "name", val: "  Grace   Hopper " }]),
            ],
        ]);

        expect(resolveEntraPrincipalDisplayName(headers)).toBe("Grace Hopper");
    });

    test("falls back to Entra given and family name claims", () => {
        const headers = new Map([
            [
                "X-MS-CLIENT-PRINCIPAL",
                encodePrincipal([
                    { typ: "given_name", val: "Grace" },
                    { typ: "family_name", val: "Hopper" },
                ]),
            ],
        ]);

        expect(resolveEntraPrincipalDisplayName(headers)).toBe("Grace Hopper");
    });

    test("does not treat an email-shaped name claim as a display name", () => {
        const headers = new Map([
            [
                "X-MS-CLIENT-PRINCIPAL",
                encodePrincipal([{ typ: "name", val: "user@example.test" }]),
            ],
        ]);

        expect(resolveEntraPrincipalDisplayName(headers)).toBeNull();
    });

    test("resolves and checks authorized tenant ids", () => {
        const tenantId = "11111111-1111-4111-8111-111111111111";
        const headers = new Map([
            [
                "X-MS-CLIENT-PRINCIPAL",
                encodePrincipal([
                    {
                        typ: "http://schemas.microsoft.com/identity/claims/tenantid",
                        val: tenantId.toUpperCase(),
                    },
                ]),
            ],
        ]);
        const allowedTenantIds = parseAuthorizedTenantIds(
            "00000000-0000-4000-8000-000000000000, 11111111-1111-4111-8111-111111111111",
        );

        expect(resolveEntraTenantId(headers)).toBe(tenantId);
        expect(
            isTenantAuthorized(tenantId.toUpperCase(), allowedTenantIds),
        ).toBe(true);
        expect(
            isTenantAuthorized(
                "22222222-2222-4222-8222-222222222222",
                allowedTenantIds,
            ),
        ).toBe(false);
    });
});
