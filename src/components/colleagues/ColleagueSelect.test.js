import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import ColleagueSelect from "./ColleagueSelect";

jest.mock("../../App", () => ({
    CurrentUserContext: require("react").createContext({
        personalEntityId: "personal",
    }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../hooks/useColleagues", () => ({
    useAssistant: () => ({}),
    useColleagues: () => ({
        data: [
            { id: "personal", name: "Concierge", kind: "personal" },
            { id: "rowan", name: "Rowan", kind: "colleague" },
        ],
    }),
}));

it.each([null, "personal"])(
    "shows a single personal option for assignment %s",
    (value) => {
        render(<ColleagueSelect value={value} onChange={() => {}} />);
        expect(
            screen.getByRole("combobox", { name: "colleagues.assignedTo" }),
        ).toHaveValue("personal");
        expect(screen.getAllByRole("option")).toHaveLength(2);
    },
);

it("assigns an explicit personal entity when switching from a colleague", () => {
    const onChange = jest.fn();
    render(<ColleagueSelect value="rowan" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "personal" },
    });
    expect(onChange).toHaveBeenCalledWith("personal");
});

it("keeps each assignment label associated with its select rather than search", () => {
    render(
        <>
            <ColleagueSelect onChange={() => {}} />
            <ColleagueSelect onChange={() => {}} />
        </>,
    );
    const selects = screen.getAllByRole("combobox", {
        name: "colleagues.assignedTo",
    });
    const labels = screen.getAllByText("colleagues.assignedTo");
    expect(selects[0].id).not.toBe(selects[1].id);
    labels.forEach((label, index) => {
        userEvent.click(label);
        expect(selects[index]).toHaveFocus();
    });
    expect(
        screen.getAllByRole("searchbox", { name: "assistantDirectory.search" }),
    ).toHaveLength(2);
});
