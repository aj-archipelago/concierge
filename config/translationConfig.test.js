/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";

import {
    getTranslationModel,
    normalizeTranslationStrategy,
    TRANSLATION_STRATEGIES,
} from "../src/components/translate/translationConfig";

describe("translation model routing", () => {
    it("keeps the legacy Gemini Flash strategy value but routes to Gemini 3.5 Flash", () => {
        expect(TRANSLATION_STRATEGIES.GEMINI_3_FLASH).toBe("gemini3flash");
        expect(getTranslationModel(TRANSLATION_STRATEGIES.GEMINI_3_FLASH)).toBe(
            "gemini-flash-35-vision",
        );
    });

    it("keeps legacy strategy values normalized to supported defaults", () => {
        expect(normalizeTranslationStrategy("GPT-5.2")).toBe(
            TRANSLATION_STRATEGIES.GPT_55,
        );
        expect(normalizeTranslationStrategy("GPT-4-OMNI")).toBe(
            TRANSLATION_STRATEGIES.GPT_4O_LEGACY,
        );
        expect(normalizeTranslationStrategy("traditional")).toBe(
            TRANSLATION_STRATEGIES.AZURE,
        );
    });

    it("keeps user-facing Gemini Flash labels on 3.5", () => {
        const checkedFiles = [
            "src/components/translate/Translation.js",
            "config/default/locales/en.json",
            "config/default/locales/ar.json",
        ];

        for (const file of checkedFiles) {
            const content = fs.readFileSync(
                path.join(process.cwd(), file),
                "utf8",
            );
            expect(content).toContain("Gemini 3.5 Flash");
            expect(content).not.toMatch(/Fastest Google \(Gemini 3 Flash\)/);
        }
    });
});
