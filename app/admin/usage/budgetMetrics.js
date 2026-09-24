export function buildBudgetRows({
    budgets = {},
    keyMappings = {},
    usage = [],
    defaultWeeklyUsd = null,
} = {}) {
    const ids = new Set([
        ...Object.keys(budgets),
        ...Object.keys(keyMappings),
        ...usage.map((row) => row._id),
    ]);
    return [...ids]
        .filter((id) => /^[a-f0-9]{12}$/.test(id || ""))
        .map((id) => {
            const budget = budgets[id];
            const cap = budget ? budget.weeklyUsd : defaultWeeklyUsd;
            const hasSnapshot = Boolean(budget?.hasSnapshot);
            const spent =
                hasSnapshot && Number.isFinite(budget.spentUsd)
                    ? budget.spentUsd
                    : null;
            const percent =
                cap > 0 && spent != null ? (spent / cap) * 100 : null;
            const status =
                cap === 0
                    ? "blocked"
                    : cap === null
                      ? "unlimited"
                      : spent != null && spent >= cap
                        ? "exhausted"
                        : percent >= 80
                          ? "near"
                          : !budget?.periodStart
                            ? "notStarted"
                            : spent == null
                              ? "waiting"
                              : "within";
            return {
                id,
                label: keyMappings[id] || id,
                budget,
                cap,
                spent,
                percent,
                status,
                remaining:
                    cap != null && spent != null
                        ? Math.max(0, cap - spent)
                        : null,
                attention: ["blocked", "exhausted", "near"].includes(status),
            };
        });
}

export function summarizeBudgets(rows) {
    return {
        recordedSpend: rows.reduce((sum, row) => sum + (row.spent || 0), 0),
        snapshots: rows.filter((row) => row.spent != null).length,
        waiting: rows.filter((row) => row.status === "waiting").length,
        attention: rows.filter((row) => row.attention).length,
        unlimited: rows.filter((row) => row.cap === null).length,
        limited: rows.filter((row) => row.cap !== null).length,
        fallbackRequests: rows.reduce(
            (sum, row) => sum + (row.budget?.fallbackRequests || 0),
            0,
        ),
    };
}

export function filterBudgetRows(
    rows,
    { search = "", filter = "all", sort = "attention" } = {},
) {
    const term = search.trim().toLocaleLowerCase();
    const ranks = {
        exhausted: 0,
        near: 1,
        blocked: 2,
        waiting: 3,
        within: 4,
        unlimited: 5,
        notStarted: 6,
    };
    return rows
        .filter(
            (row) =>
                (!term ||
                    `${row.label} ${row.id}`
                        .toLocaleLowerCase()
                        .includes(term)) &&
                (filter === "all" ||
                    (filter === "attention"
                        ? row.attention
                        : filter === "unlimited"
                          ? row.cap === null
                          : row.cap !== null)),
        )
        .sort((a, b) => {
            if (sort === "name") return a.label.localeCompare(b.label);
            if (sort === "spend")
                return (
                    (b.spent ?? -1) - (a.spent ?? -1) ||
                    a.label.localeCompare(b.label)
                );
            return (
                ranks[a.status] - ranks[b.status] ||
                (b.percent ?? -1) - (a.percent ?? -1) ||
                a.label.localeCompare(b.label)
            );
        });
}

export function budgetCsv(rows) {
    const cell = (value) => {
        const text = String(value ?? "");
        // Labels are administrator-managed text, not spreadsheet formulas.
        const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
        return `"${safe.replaceAll('"', '""')}"`;
    };
    return [
        [
            "api_key_id",
            "label",
            "weekly_cap_usd",
            "recorded_spend_usd",
            "remaining_usd",
            "status",
            "period_start",
            "reset_at",
            "snapshot_at",
            "fallback_estimate_requests",
        ],
        ...rows.map((row) => [
            row.id,
            row.label,
            row.cap === null ? "unlimited" : row.cap,
            row.spent,
            row.remaining,
            row.status,
            row.budget?.periodStart,
            row.budget?.resetAt,
            row.budget?.snapshotAt,
            row.budget?.fallbackRequests ?? "",
        ]),
    ]
        .map((row) => row.map(cell).join(","))
        .join("\n");
}
