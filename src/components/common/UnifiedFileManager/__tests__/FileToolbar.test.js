import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import FileToolbar from "../FileToolbar";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("i18next", () => ({
    language: "en",
}));

jest.mock("lucide-react", () => {
    const Icon = () => <span />;
    return {
        ChevronRight: Icon,
        ChevronDown: Icon,
        ChevronUp: Icon,
        Folder: Icon,
        List: Icon,
        LayoutGrid: Icon,
        Upload: Icon,
        RefreshCw: Icon,
        Search: Icon,
        X: Icon,
    };
});

describe("FileToolbar", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it("clears the file filter from the clear button", () => {
        const onFilterChange = jest.fn();

        render(
            <FileToolbar
                breadcrumbs={[{ label: "All Files", path: "" }]}
                onNavigate={jest.fn()}
                filterText="alpha"
                onFilterChange={onFilterChange}
                viewMode="list"
                onViewModeChange={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Clear Filter" }));

        expect(onFilterChange).toHaveBeenCalledWith("");
    });

    it("keeps the mobile filter collapsed until search is tapped", () => {
        render(
            <FileToolbar
                breadcrumbs={[{ label: "All Files", path: "" }]}
                onNavigate={jest.fn()}
                filterText=""
                onFilterChange={jest.fn()}
                viewMode="list"
                onViewModeChange={jest.fn()}
                isMobile
            />,
        );

        expect(
            screen.queryByPlaceholderText("Filter files..."),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Search" }));

        expect(
            screen.getByPlaceholderText("Filter files..."),
        ).toBeInTheDocument();
        expect(screen.getByRole("textbox")).toHaveFocus();
    });

    it("shows the mobile filter when a filter is active", () => {
        render(
            <FileToolbar
                breadcrumbs={[{ label: "All Files", path: "" }]}
                onNavigate={jest.fn()}
                filterText="frog"
                onFilterChange={jest.fn()}
                viewMode="list"
                onViewModeChange={jest.fn()}
                isMobile
            />,
        );

        expect(screen.getByDisplayValue("frog")).toBeInTheDocument();
    });

    it("shows refresh feedback briefly after clicking reload", async () => {
        jest.useFakeTimers();
        const onRefresh = jest.fn();

        render(
            <FileToolbar
                breadcrumbs={[{ label: "All Files", path: "" }]}
                onNavigate={jest.fn()}
                filterText=""
                onFilterChange={jest.fn()}
                viewMode="list"
                onViewModeChange={jest.fn()}
                onRefresh={onRefresh}
            />,
        );

        const refreshButton = screen.getByRole("button", { name: "Refresh" });
        fireEvent.click(refreshButton);

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(refreshButton).toHaveAttribute("aria-busy", "true");
        expect(refreshButton).toBeDisabled();

        await act(async () => {
            await Promise.resolve();
            jest.advanceTimersByTime(450);
        });

        expect(refreshButton).toHaveAttribute("aria-busy", "false");
        expect(refreshButton).not.toBeDisabled();
    });
});
