import {
    buildPricingMap,
    computeRunRate,
    computeTotalTokens,
    computeUsageCost,
    getWindowDays,
} from "./usageMetrics";

describe("usageMetrics", () => {
    const pricingMap = buildPricingMap([
        {
            modelId: "gpt-foo",
            emulateOpenAIChatModel: "foo-alias",
            pricing: {
                input: 10,
                output: 20,
                cacheWrite: 5,
                cacheRead: 1,
            },
        },
        {
            modelId: "gpt-bar",
            pricingAliases: ["provider-gpt-bar"],
            pricing: {
                input: 2,
                output: 4,
                cacheWrite: 1,
                cacheRead: 0.5,
            },
        },
    ]);

    it("sums provider total tokens from input and output buckets", () => {
        expect(
            computeTotalTokens({
                input_tokens: 100,
                output_tokens: 50,
                cache_creation_input_tokens: 25,
                cache_read_input_tokens: 10,
            }),
        ).toBe(150);
    });

    it("prefers a precomputed total token count when present", () => {
        expect(
            computeTotalTokens({
                total_tokens: 999,
                input_tokens: 1,
                output_tokens: 1,
            }),
        ).toBe(999);
    });

    it("computes cost for a model row using pricing metadata", () => {
        expect(
            computeUsageCost(
                {
                    _id: "foo-alias",
                    input_tokens: 1_000_000,
                    output_tokens: 500_000,
                    cache_creation_input_tokens: 250_000,
                    cache_read_input_tokens: 2_000_000,
                },
                pricingMap,
            ),
        ).toBeCloseTo(23.25);
    });

    it("computes grouped-row cost from per-model breakdowns", () => {
        expect(
            computeUsageCost(
                {
                    _id: "key-123",
                    model_breakdown: [
                        {
                            model: "gpt-foo",
                            input_tokens: 1_000_000,
                            output_tokens: 500_000,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 0,
                        },
                        {
                            model: "gpt-bar",
                            input_tokens: 500_000,
                            output_tokens: 500_000,
                            cache_creation_input_tokens: 500_000,
                            cache_read_input_tokens: 500_000,
                        },
                        {
                            model: "unknown-model",
                            input_tokens: 9_000_000,
                            output_tokens: 9_000_000,
                        },
                    ],
                },
                pricingMap,
            ),
        ).toBeCloseTo(23.75);
    });

    it("maps provider model aliases to configured model pricing", () => {
        expect(
            computeUsageCost(
                {
                    _id: "provider-gpt-bar",
                    input_tokens: 1_000_000,
                    output_tokens: 500_000,
                },
                pricingMap,
            ),
        ).toBeCloseTo(4);
    });

    it("returns null when no pricing matches the usage row", () => {
        expect(
            computeUsageCost(
                {
                    _id: "unknown-model",
                    input_tokens: 1000,
                },
                pricingMap,
            ),
        ).toBeNull();
    });

    it("normalizes run rate to a 30-day window", () => {
        const startDate = "2026-03-11T00:00:00.000Z";
        const endDate = "2026-03-18T23:59:59.999Z";

        expect(getWindowDays(startDate, endDate)).toBe(8);
        expect(computeRunRate(80, startDate, endDate)).toBeCloseTo(300);
    });
});
