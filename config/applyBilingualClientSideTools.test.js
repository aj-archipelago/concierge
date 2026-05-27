/**
 * @jest-environment node
 */
import {
    applyBilingualClientSideTools,
    BILINGUAL_CLIENT_TOOL_DESC_SEPARATOR,
} from "../src/utils/applyBilingualClientSideTools";

describe("applyBilingualClientSideTools", () => {
    const sample = [
        {
            type: "function",
            function: {
                name: "Demo",
                description: "English",
                descriptionAr: "العربية",
            },
        },
    ];

    it("leaves description English and strips descriptionAr when not RTL", () => {
        const out = applyBilingualClientSideTools(sample, false);
        expect(out[0].function.description).toBe("English");
        expect(out[0].function.descriptionAr).toBeUndefined();
    });

    it("merges English and Arabic in description when RTL", () => {
        const out = applyBilingualClientSideTools(sample, true);
        expect(out[0].function.description).toBe(
            `English${BILINGUAL_CLIENT_TOOL_DESC_SEPARATOR}العربية`,
        );
        expect(out[0].function.descriptionAr).toBeUndefined();
    });
});
