/**
 * @jest-environment node
 */
import { BSON } from "mongodb";
import { validateAppletDataPayload } from "../appletDataLimits";

jest.mock("next/server", () => ({
    NextResponse: {
        json: (body, options) => ({ ...body, status: options.status }),
    },
}));

describe("applet data storage size", () => {
    test("rejects arrays that fit in JSON but exceed the BSON document limit", () => {
        const value = Array.from({ length: 190000 }, (_, i) => i);
        expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(
            2 * 1024 * 1024,
        );
        expect(BSON.calculateObjectSize({ value })).toBeGreaterThan(
            2 * 1024 * 1024,
        );
        const result = validateAppletDataPayload({ key: "segments", value });
        expect(result.ok).toBe(false);
        expect(result.response.status).toBe(413);
        expect(result.response.code).toBe("APPLET_DATA_VALUE_TOO_LARGE");
    });

    test("reserves document metadata space for values near the JSON limit", () => {
        const result = validateAppletDataPayload({
            key: "draft",
            value: "x".repeat(2 * 1024 * 1024 - 2),
        });
        expect(result.ok).toBe(false);
        expect(result.response.status).toBe(413);
    });

    test("accepts a one megabyte image encoded in JSON", () => {
        const value = {
            portrait:
                "data:image/png;base64," +
                Buffer.alloc(1024 * 1024).toString("base64"),
        };
        expect(validateAppletDataPayload({ key: "draft", value }).ok).toBe(
            true,
        );
    });
});
