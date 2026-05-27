import ar from "../../config/default/locales/ar.json";
import en from "../../config/default/locales/en.json";
import {
    getReasoningEffortLevelsForModel,
    normalizeReasoningEffortForModel,
    REASONING_EFFORT_LEVELS,
    reasoningEffortLevelLabelKey,
} from "../utils/reasoningEffortI18n";

describe("reasoningEffortI18n", () => {
    it("emits keys present in en and ar locale files", () => {
        const keys = [
            "Reasoning",
            "Reasoning Effort",
            ...REASONING_EFFORT_LEVELS.map((l) =>
                reasoningEffortLevelLabelKey(l),
            ),
        ];
        for (const key of keys) {
            expect(typeof en[key]).toBe("string");
            expect(en[key].length).toBeGreaterThan(0);
            expect(typeof ar[key]).toBe("string");
            expect(ar[key].length).toBeGreaterThan(0);
        }
    });

    it("uses the global effort list when model metadata does not restrict it", () => {
        expect(getReasoningEffortLevelsForModel({})).toEqual(
            REASONING_EFFORT_LEVELS,
        );
        expect(normalizeReasoningEffortForModel({}, "high")).toBe("high");
    });

    it("uses model-specific reasoning effort metadata when present", () => {
        const model = { supportedReasoningEfforts: ["medium"] };

        expect(getReasoningEffortLevelsForModel(model)).toEqual(["medium"]);
        expect(normalizeReasoningEffortForModel(model, "none")).toBe("medium");
        expect(normalizeReasoningEffortForModel(model, "medium")).toBe(
            "medium",
        );
    });

    it("deduplicates model metadata and preserves canonical order", () => {
        const model = {
            supportedReasoningEfforts: ["high", "medium", "high", "low"],
        };

        expect(getReasoningEffortLevelsForModel(model)).toEqual([
            "low",
            "medium",
            "high",
        ]);
    });
});
