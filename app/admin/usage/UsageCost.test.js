import React from "react";
import { render, screen } from "@testing-library/react";
import UsageCost from "./UsageCost";
import mockEnglish from "../../../config/default/locales/en.json";
import mockArabic from "../../../config/default/locales/ar.json";
let mockLanguage = "en";
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key, params = {}) =>
            Object.entries(params).reduce(
                (text, [name, value]) =>
                    text.replaceAll(`{{${name}}}`, String(value)),
                (mockLanguage === "ar" ? mockArabic : mockEnglish)[key] || key,
            ),
    }),
}));
const partial = {
    cost: 35,
    complete: false,
    unpricedRequests: 1,
    unpricedModels: ["legacy"],
};
it("shows partial dollars and marks the corresponding projection", () => {
    render(
        <>
            <UsageCost details={partial} />
            <UsageCost details={partial} value={150} per30Days />
        </>,
    );
    expect(screen.getByText("$35.00")).toBeTruthy();
    expect(screen.getByText("$150.00 / 30d")).toBeTruthy();
    expect(screen.getAllByText("Partial")).toHaveLength(2);
});
it("does not turn wholly unpriced usage into a zero", () => {
    render(<UsageCost details={{ ...partial, cost: null }} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Unpriced")).toBeTruthy();
    expect(screen.queryByText("$0.00")).toBeNull();
});
it("localizes the visible partial label and missing-data explanation", () => {
    mockLanguage = "ar";
    render(<UsageCost details={partial} />);
    expect(screen.getByText("جزئي").title).toContain("legacy");
    expect(screen.getByText("جزئي").title).toContain("تفتقد 1");
    mockLanguage = "en";
});
