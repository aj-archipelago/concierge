import {
    buildBudgetRows,
    budgetCsv,
    filterBudgetRows,
    summarizeBudgets,
} from "./budgetMetrics";

const id = "000000000001";
const current = {
    weeklyUsd: 500,
    periodStart: "2026-09-10T00:00:00Z",
    resetAt: "2026-09-17T00:00:00Z",
};
it("distinguishes missing spend from a recorded zero", () => {
    const missing = buildBudgetRows({ budgets: { [id]: current } })[0];
    const zero = buildBudgetRows({
        budgets: { [id]: { ...current, hasSnapshot: true, spentUsd: 0 } },
    })[0];
    expect(missing).toMatchObject({
        spent: null,
        remaining: null,
        status: "waiting",
    });
    expect(zero).toMatchObject({ spent: 0, remaining: 500, status: "within" });
    expect(summarizeBudgets([missing, zero])).toMatchObject({
        snapshots: 1,
        waiting: 1,
        recordedSpend: 0,
    });
});
it.each([
    [399, "within"],
    [400, "near"],
    [500, "exhausted"],
    [600, "exhausted"],
])("classifies %p spending without hiding overshoot", (spentUsd, status) => {
    const row = buildBudgetRows({
        budgets: { [id]: { ...current, hasSnapshot: true, spentUsd } },
    })[0];
    expect(row.status).toBe(status);
    expect(row.spent).toBe(spentUsd);
    expect(row.remaining).toBe(Math.max(0, 500 - spentUsd));
});
it("includes labelled inactive keys and explicit unlimited and zero policies", () => {
    const rows = buildBudgetRows({
        defaultWeeklyUsd: 500,
        keyMappings: { [id]: "Inactive" },
        budgets: {
            "000000000002": { weeklyUsd: null },
            "000000000003": { weeklyUsd: 0 },
        },
        usage: [{ _id: "local" }],
    });
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.id === id)).toMatchObject({
        cap: 500,
        status: "notStarted",
    });
    expect(
        filterBudgetRows(rows, { filter: "attention" }).map(
            (row) => row.status,
        ),
    ).toEqual(["blocked"]);
    expect(
        filterBudgetRows(rows, { filter: "unlimited" }).map((row) => row.cap),
    ).toEqual([null]);
    expect(filterBudgetRows(rows, { search: "INACTIVE" })).toHaveLength(1);
});
it("exports missing spend as blank and neutralizes spreadsheet formulas in labels", () => {
    const rows = buildBudgetRows({
        defaultWeeklyUsd: 500,
        keyMappings: { [id]: '=HYPERLINK("unsafe")' },
    });
    const csv = budgetCsv(rows);
    expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
    expect(csv).toContain('"500","","","notStarted"');
});

it("leaves unconfigured keys unlimited", () => {
    expect(
        buildBudgetRows({ keyMappings: { [id]: "New key" } })[0],
    ).toMatchObject({ cap: null, status: "unlimited" });
});
