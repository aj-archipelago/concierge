import {
    buildPricingMap,
    computeRunRate,
    computeTotalTokens,
    computeUsageCost,
    getWindowDays,
    getUsageCostDetails,
    getUsageDateRange,
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

    it("includes all four metered token buckets", () => {
        expect(
            computeTotalTokens({
                input_tokens: 100,
                output_tokens: 50,
                cache_creation_input_tokens: 25,
                cache_read_input_tokens: 10,
            }),
        ).toBe(185);
    });

    it("prefers a precomputed metered token count over provider totals", () => {
        expect(
            computeTotalTokens({
                metered_tokens: 999,
                total_tokens: 2,
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

    it("retains the known subtotal when another model is unpriced", () => {
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

        expect(getWindowDays(startDate, endDate)).toBeCloseTo(8);
        expect(computeRunRate(80, startDate, endDate)).toBeCloseTo(300);
    });
});

it("uses the configured Luna prices for auto-review without duplicating a rate card", () => {
    const row = {
        model: "codex-auto-review",
        requests: 2,
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
    };
    const prices = buildPricingMap([
        {
            modelId: "oai-gpt56-luna",
            emulateOpenAIChatModel: "gpt-5.6-luna",
            pricing: { input: 2, output: 10, cacheRead: 0.2 },
        },
    ]);
    expect(getUsageCostDetails(row, prices)).toEqual({
        cost: 12.2,
        complete: true,
        unpricedRequests: 0,
        unpricedModels: [],
    });
    expect(
        computeUsageCost(row, {
            ...prices,
            "codex-auto-review": { input: 1, output: 1, cacheRead: 1 },
        }),
    ).toBe(3);
    expect(computeUsageCost(row, {})).toBeNull();
});

it("shows a priced subtotal and identifies omitted requests", () => {
    const result = getUsageCostDetails(
        {
            model_breakdown: [
                { model: "known", requests: 2, input_tokens: 1000000 },
                { model: "missing", requests: 3, input_tokens: 500 },
            ],
        },
        { known: { input: 5 } },
    );
    expect(result).toEqual({
        cost: 5,
        complete: false,
        unpricedRequests: 3,
        unpricedModels: ["missing"],
    });
});
it("uses elapsed time rather than rounding partial days or counting future hours", () => {
    const now = new Date("2026-09-07T12:00:00Z");
    const range = getUsageDateRange("7d", now);
    expect(range).toEqual({
        startDate: "2026-08-31T12:00:00.000Z",
        endDate: now.toISOString(),
    });
    const today = getUsageDateRange("today", now);
    expect(getWindowDays(today.startDate, today.endDate)).toBe(0.5);
    expect(computeRunRate(10, today.startDate, today.endDate)).toBe(600);
});

it("keeps known costs when every model also has legacy requests", () => {
    const modern = {
        model: "known",
        requests: 1,
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        metered_tokens: 2_000_000,
        unbucketed_requests: 0,
    };
    const mixed = {
        ...modern,
        requests: 2,
        metered_tokens: 2_000_050,
        unbucketed_requests: 1,
    };
    const prices = { known: { input: 5, output: 30 } };
    expect(getUsageCostDetails(modern, prices).cost).toBe(35);
    expect(getUsageCostDetails(mixed, prices)).toEqual({
        cost: 35,
        complete: false,
        unpricedRequests: 1,
        unpricedModels: ["known"],
    });
    // The dashboard's overall subtotal uses this same breakdown calculation.
    expect(getUsageCostDetails({ model_breakdown: [mixed] }, prices).cost).toBe(
        35,
    );
    expect(computeUsageCost(mixed, prices)).toBe(35);
    expect(
        computeRunRate(
            computeUsageCost(mixed, prices),
            "2026-09-01",
            "2026-09-08",
        ),
    ).toBe(150);
});
it("does not present all-legacy usage as a priced zero or count unknown requests twice", () => {
    const row = {
        model: "known",
        requests: 2,
        input_tokens: 0,
        output_tokens: 0,
        metered_tokens: 50,
        unbucketed_requests: 2,
    };
    for (const prices of [{ known: { input: 5, output: 30 } }, {}]) {
        expect(getUsageCostDetails(row, prices)).toEqual({
            cost: null,
            complete: false,
            unpricedRequests: 2,
            unpricedModels: ["known"],
        });
    }
});
it("keeps aggregates without legacy counts conservatively unpriced", () => {
    expect(
        getUsageCostDetails(
            {
                model: "known",
                requests: 2,
                input_tokens: 10,
                metered_tokens: 60,
            },
            { known: { input: 5 } },
        ).cost,
    ).toBeNull();
});

it("retains input and output costs when the cache rate is missing", () => {
    const row = {
        model: "known",
        requests: 2,
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
    };
    expect(
        getUsageCostDetails(row, { known: { input: 5, output: 30 } }),
    ).toEqual({
        cost: 35,
        complete: false,
        unpricedRequests: 2,
        unpricedModels: ["known"],
    });
});
it.each([undefined, -1, NaN, Infinity])(
    "does not treat a missing or invalid rate (%s) as free usage",
    (rate) => {
        expect(
            getUsageCostDetails(
                { model: "known", requests: 1, cache_read_input_tokens: 100 },
                { known: { cacheRead: rate } },
            ),
        ).toEqual({
            cost: null,
            complete: false,
            unpricedRequests: 1,
            unpricedModels: ["known"],
        });
    },
);
it("accepts an explicitly free token category", () => {
    expect(
        getUsageCostDetails(
            { model: "known", requests: 1, cache_read_input_tokens: 100 },
            { known: { cacheRead: 0 } },
        ),
    ).toEqual({
        cost: 0,
        complete: true,
        unpricedRequests: 0,
        unpricedModels: [],
    });
});

it("prices dated OpenAI snapshots using only their configured base model", () => {
    const row = {
        _id: "gpt-5.2-2025-12-11",
        requests: 1,
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
    };
    const prices = { "gpt-5.2": { input: 1.75, output: 14, cacheRead: 0.175 } };
    expect(getUsageCostDetails(row, prices)).toEqual({
        cost: 15.925,
        complete: true,
        unpricedRequests: 0,
        unpricedModels: [],
    });
    expect(
        computeUsageCost(row, {
            ...prices,
            "gpt-5.2-2025-12-11": { input: 2, output: 10, cacheRead: 0.5 },
        }),
    ).toBe(12.5);
    expect(
        computeUsageCost({ ...row, _id: "gpt-unknown-2025-12-11" }, prices),
    ).toBeNull();
    expect(
        computeUsageCost(
            { ...row, _id: "claude-sonnet-2025-12-11" },
            { "claude-sonnet": prices["gpt-5.2"] },
        ),
    ).toBeNull();
});
