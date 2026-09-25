import { buildIntervalUsageCsv } from "./usageExport";

it("exports partial dollars with coverage and keeps unavailable costs blank", () => {
    const csv = buildIntervalUsageCsv(
        [
            {
                _id: "2026-09-01",
                requests: 3,
                model_breakdown: [
                    { model: "known", requests: 2, input_tokens: 1_000_000 },
                    { model: "missing", requests: 1, input_tokens: 30 },
                ],
            },
            {
                _id: "2026-09-02",
                requests: 1,
                input_tokens: 30,
                model_breakdown: [
                    { model: "missing", requests: 1, input_tokens: 30 },
                ],
            },
            { _id: "2026-09-03", requests: 0 },
        ],
        {
            apiKeyId: "key",
            apiKeyLabel: 'A "quoted", label',
            pricingMap: { known: { input: 5 } },
        },
    );
    const lines = csv.split("\n");
    expect(lines[0]).toContain(
        "estimated_cost_usd,cost_status,unpriced_requests,unpriced_models",
    );
    expect(lines[1]).toContain('"A ""quoted"", label"');
    expect(lines[1]).toMatch(/,5.000000,partial,1,missing$/);
    expect(lines[2]).toMatch(/,,unavailable,1,missing$/);
    expect(lines[3]).toMatch(/,0.000000,estimated,0,$/);
});
