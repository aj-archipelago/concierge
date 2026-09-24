import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import UsagePage from "./page";
import mockEnglish from "../../../config/default/locales/en.json";

const mockKnown = { model: "known", requests: 2, input_tokens: 1_000_000 };
const mockMissing = { model: "missing", requests: 1, input_tokens: 10 };
const mockRows = [
    {
        _id: "2026-09-01",
        requests: 3,
        model_breakdown: [mockKnown, mockMissing],
    },
    { _id: "2026-09-02", requests: 1, model_breakdown: [mockMissing] },
];
const mockIntervals = mockRows.map((row, index) => ({
    ...row,
    _id:
        new Date(Date.now() - (2 - index) * 3_600_000)
            .toISOString()
            .slice(0, 13)
            .replace("T", " ") + ":00",
}));
const mockOverview = {
    byModel: [
        { ...mockKnown, _id: "known" },
        { ...mockMissing, _id: "missing", requests: 2 },
    ],
    byKey: [
        {
            _id: "key",
            requests: 4,
            model_breakdown: [mockKnown, { ...mockMissing, requests: 2 }],
        },
    ],
    byDay: mockRows,
    endDate: "2026-09-08T00:00:00Z",
};
jest.mock("../../../src/contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key, params = {}) =>
            Object.entries(params).reduce(
                (s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)),
                mockEnglish[key] || key,
            ),
    }),
}));
jest.mock("../../queries/modelMetadata", () => ({
    useModelMetadata: () => ({
        data: { models: [{ modelId: "known", pricing: { input: 5 } }] },
    }),
}));
jest.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ setQueryData: jest.fn() }),
    useQuery: ({ queryKey }) => ({
        data:
            queryKey[1] === "overview"
                ? mockOverview
                : queryKey[1] === "limits"
                  ? { budgets: {} }
                  : queryKey[1] === "hour"
                    ? mockIntervals
                    : {},
        refetch: jest.fn(),
    }),
}));
jest.mock("./BudgetPortal", () => () => null);
jest.mock("./WeeklyBudgetControl", () => () => null);

it("keeps daily estimates and the overall pace visible when another model is unpriced", () => {
    render(<UsagePage />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Daily usage" }), {
        button: 0,
        ctrlKey: false,
    });
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("$5.00")).toBeTruthy();
    expect(within(rows[1]).getByText("Partial")).toBeTruthy();
    expect(within(rows[2]).getByText("Unpriced")).toBeTruthy();
    expect(within(rows[2]).queryByText("$0.00")).toBeNull();
    expect(screen.getByText("$21.43")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
        "Models with gaps: missing",
    );
});

it("retains the chart subtotal when another interval is wholly unpriced", () => {
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = jest.fn();
    try {
        render(<UsagePage />);
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Key activity" }), {
            button: 0,
            ctrlKey: false,
        });
        fireEvent.click(
            screen.getByRole("button", { name: "View", exact: true }),
        );
        const chartCost = screen.getByRole("group", {
            name: "Total estimated cost",
        });
        expect(within(chartCost).getByText("$5.00")).toBeTruthy();
        expect(within(chartCost).getByText("Partial")).toBeTruthy();
    } finally {
        Element.prototype.scrollIntoView = originalScroll;
    }
});

it("keeps key and model estimates consistent with the daily subtotals", () => {
    render(<UsagePage />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Key activity" }), {
        button: 0,
        ctrlKey: false,
    });
    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(within(row).getByText("$5.00")).toBeTruthy();
    expect(within(row).getByText("$21.43 / 30d")).toBeTruthy();
    expect(within(row).getAllByText("Partial")).toHaveLength(2);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "By model" }), {
        button: 0,
        ctrlKey: false,
    });
    const modelRows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(modelRows[1]).getByText("$5.00")).toBeTruthy();
    expect(within(modelRows[1]).queryByText("Partial")).toBeNull();
    expect(within(modelRows[2]).getAllByText("Unpriced")).toHaveLength(2);
});
