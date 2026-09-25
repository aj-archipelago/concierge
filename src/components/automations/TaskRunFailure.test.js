import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import TaskRunFailure from "./TaskRunFailure";
import { LanguageContext } from "../../contexts/LanguageProvider";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));

it("preserves diagnostic text with HTML treated as text, and respects RTL", () => {
    const details =
        "<script>unexpected()</script>\nApolloError at worker.js:12:4";
    render(
        <LanguageContext.Provider value={{ direction: "rtl" }}>
            <TaskRunFailure run={{ error: details, statusText: details }} />
        </LanguageContext.Provider>,
    );
    expect(screen.getByRole("region")).toHaveAttribute("dir", "rtl");
    const diagnostic = screen.getByText(/<script>unexpected\(\)<\/script>/);
    expect(diagnostic).not.toBeVisible();
    expect(diagnostic).toHaveAttribute("dir", "ltr");
    expect(diagnostic).toHaveTextContent(details.replace(/\s+/g, " "));
});

it("omits technical details when none were recorded", () => {
    render(<TaskRunFailure run={{ status: "failed" }} />);
    expect(screen.getByText("colleagues.taskFailedHelp")).toBeVisible();
    expect(
        screen.queryByText("colleagues.technicalDetails"),
    ).not.toBeInTheDocument();
});
