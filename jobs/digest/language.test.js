/**
 * @jest-environment node
 */

import UserState from "../../app/api/models/user-state.mjs";
import {
    getPreferredDigestLanguage,
    parsePreferredDigestLanguage,
} from "./language.js";

jest.mock("../../app/api/models/user-state.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

describe("digest language preference", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test.each([
        [JSON.stringify({ preferences: { language: "ar" } }), "ar"],
        [JSON.stringify({ preferences: { language: "ar-QA" } }), "ar"],
        [JSON.stringify({ preferences: { language: "en" } }), "en"],
        [JSON.stringify({ preferences: { language: "fr" } }), null],
        [JSON.stringify({}), null],
        ["invalid json", null],
        [null, null],
    ])("parses %p as %p", (serializedState, expected) => {
        expect(parsePreferredDigestLanguage(serializedState)).toBe(expected);
    });

    it("loads the saved preference for a scheduled digest build", async () => {
        UserState.findOne.mockResolvedValue({
            serializedState: JSON.stringify({
                preferences: { language: "ar" },
            }),
        });

        await expect(getPreferredDigestLanguage("user-1")).resolves.toBe("ar");
        expect(UserState.findOne).toHaveBeenCalledWith({ user: "user-1" });
    });

    it("fails soft when the preference store is temporarily unavailable", async () => {
        const logger = { log: jest.fn() };
        UserState.findOne.mockRejectedValue(new Error("database unavailable"));

        await expect(
            getPreferredDigestLanguage("user-1", logger),
        ).resolves.toBeNull();
        expect(logger.log).toHaveBeenCalledWith(
            "[Digest] Could not load language preference: database unavailable",
            "user-1",
        );
    });
});
