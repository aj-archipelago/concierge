import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateAutomationDialog from "./CreateAutomationDialog";

jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("../../App", () => ({
    CurrentUserContext: require("react").createContext({
        personalEntityId: "personal",
    }),
}));

const mockCreate = jest.fn();
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../hooks/useAutomations", () => ({
    useCreateAutomation: () => ({ mutateAsync: mockCreate, isPending: false }),
    useSuggestAutomation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("../../hooks/useColleagues", () => ({
    useAssistant: () => ({}),
    useColleagues: () => ({
        data: [
            { id: "personal", kind: "personal", name: "Assistant" },
            { id: "noor", kind: "colleague", name: "Noor", status: "active" },
        ],
    }),
}));

it("creates the automation for the colleague selected in the dialog", async () => {
    mockCreate.mockResolvedValue({ _id: "created", entityId: "noor" });
    const onCreated = jest.fn();
    render(
        <CreateAutomationDialog
            open
            onOpenChange={() => {}}
            onCreated={onCreated}
        />,
    );
    fireEvent.change(
        screen.getByRole("combobox", { name: "colleagues.assignedTo" }),
        { target: { value: "noor" } },
    );
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Summarize my notes" },
    });
    fireEvent.click(
        screen.getByRole("button", { name: "Create", exact: true }),
    );
    await waitFor(() =>
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ entityId: "noor" }),
        ),
    );
    expect(onCreated).toHaveBeenCalledWith(
        { _id: "created", entityId: "noor" },
        { customize: false },
    );
});
