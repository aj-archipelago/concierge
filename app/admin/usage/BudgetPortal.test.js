import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import BudgetPortal from "./BudgetPortal";
import mockEnglish from "../../../config/default/locales/en.json";
jest.mock("../../../src/contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "rtl" }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key, params = {}) =>
            Object.entries(params).reduce(
                (text, [name, value]) =>
                    text.replaceAll(`{{${name}}}`, String(value)),
                mockEnglish[key] || key,
            ),
        i18n: { resolvedLanguage: "en" },
    }),
}));
const props = {
    limits: {
        defaultWeeklyUsd: 500,
        generatedAt: "2026-09-12T00:00:00Z",
        budgets: {
            "000000000001": {
                weeklyUsd: 500,
                spentUsd: 450,
                hasSnapshot: true,
                periodStart: "2026-09-10T00:00:00Z",
                resetAt: "2026-09-17T00:00:00Z",
                snapshotAt: "2026-09-12T00:00:00Z",
            },
            "000000000002": { weeklyUsd: null },
            "000000000003": {
                weeklyUsd: 500,
                periodStart: "2026-09-10T00:00:00Z",
            },
        },
    },
    keyMappings: {
        "000000000001": "Near limit",
        "000000000002": "Unlimited key",
        "000000000003": "Waiting key",
    },
    onInspect: jest.fn(),
    onSaved: jest.fn(),
    onRefresh: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());
it("shows snapshot-backed spend, missing data and budget status separately", () => {
    render(<BudgetPortal {...props} />);
    expect(screen.getByRole("region").getAttribute("dir")).toBe("rtl");
    expect(
        within(screen.getByRole("article", { name: "Near limit" }))
            .getByRole("progressbar")
            .getAttribute("aria-valuenow"),
    ).toBe("90");
    const missing = screen.getByRole("article", { name: "Waiting key" });
    expect(within(missing).getByText("Awaiting snapshot")).toBeTruthy();
    expect(within(missing).queryByText("$0.00")).toBeNull();
    fireEvent.click(
        within(
            screen.getByRole("article", { name: "Unlimited key" }),
        ).getByText("View activity"),
    );
    expect(props.onInspect).toHaveBeenCalledWith("000000000002");
});
it("filters by budget attention and searches labels without additional queries", () => {
    render(<BudgetPortal {...props} />);
    fireEvent.change(screen.getByLabelText("Filter keys"), {
        target: { value: "attention" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search key name or fingerprint"), {
        target: { value: "missing" },
    });
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText("No keys match these filters.")).toBeTruthy();
});
it("keeps last data visibly stale and disables editing on refresh failure", () => {
    render(<BudgetPortal {...props} error={new Error("offline")} />);
    expect(screen.getByRole("alert").textContent).toContain(
        "last successful read",
    );
    for (const button of screen.getAllByText("Edit weekly cap"))
        expect(button.disabled).toBe(true);
});
