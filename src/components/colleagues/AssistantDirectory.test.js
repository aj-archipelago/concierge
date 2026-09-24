import React from "react";
import "@testing-library/jest-dom";
import {
    render,
    screen,
    fireEvent,
    cleanup,
    within,
    waitFor,
} from "@testing-library/react";
import AssistantDirectory from "./AssistantDirectory";
import { LanguageContext } from "../../contexts/LanguageProvider";
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("../../../app/queries/modelMetadata", () => ({
    useAgentModels: () => ({
        data: [
            { modelId: "model-a", displayName: "Atlas" },
            { modelId: "model-b", displayName: "Beacon" },
        ],
    }),
    resolveAgentModelForSend: (value) => value,
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("./ColleagueAvatar", () => ({
    __esModule: true,
    default: () => <span />,
    getEntityWispVariant: () => "orbit",
}));
jest.mock("../../hooks/useColleagues", () => ({
    useAssistantDirectory: jest.fn(() => ({
        data: { colleagues: [], total: 0 },
    })),
}));
const items = (count) =>
    Array.from({ length: count }, (_, i) => ({
        id: String(i),
        name: `Assistant ${i}`,
        status: "active",
    }));
beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});
it.each([
    [6, "large"],
    [7, "compact"],
    [18, "compact"],
    [19, "list"],
])("adapts %i assistants to %s", (count, layout) => {
    render(
        <AssistantDirectory assistants={items(count)} onSelect={() => {}} />,
    );
    expect(screen.getByRole("navigation")).toHaveAttribute(
        "data-layout",
        layout,
    );
});
it("keeps an explicit list preference and does not change layout while filtering", () => {
    const select = jest.fn();
    render(<AssistantDirectory assistants={items(12)} onSelect={select} />);
    fireEvent.change(
        screen.getByRole("combobox", { name: "assistantDirectory.view" }),
        {
            target: { value: "list" },
        },
    );
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Assistant 11" },
    });
    expect(screen.getByRole("navigation")).toHaveAttribute(
        "data-layout",
        "list",
    );
    fireEvent.click(screen.getByRole("button", { name: /Assistant 11/ }));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: "11" }));
    cleanup();
    render(<AssistantDirectory assistants={items(2)} onSelect={select} />);
    expect(screen.getByRole("navigation")).toHaveAttribute(
        "data-layout",
        "list",
    );
});

const team = [
    {
        id: "z",
        name: "Zora 10",
        description: "Research",
        model: "model-a",
        status: "paused",
        isOwner: false,
    },
    {
        id: "b",
        name: "Zora 2",
        description: "Editing",
        model: "model-b",
        status: "active",
        isOwner: true,
    },
    {
        id: "a",
        name: "Amal",
        description: "Research",
        model: "model-b",
        status: "active",
        isOwner: false,
        visibility: "public",
    },
];
const names = () =>
    within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getByRole("button").textContent);
it("uses dense table rows with natural sorting, column toggles, and numeric updates", () => {
    localStorage.setItem("assistant-directory-view", "list");
    render(
        <AssistantDirectory
            assistants={team}
            onSelect={() => {}}
            unreadCount={(a) => (a.id === "a" ? 12 : a.id === "z" ? 2 : 0)}
        />,
    );
    expect(names()).toEqual(["Amal", "Zora 2", "Zora 10"]);
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute(
        "aria-sort",
        "descending",
    );
    expect(names()).toEqual(["Zora 10", "Zora 2", "Amal"]);
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    expect(names()).toEqual(["Zora 10", "Amal", "Zora 2"]);
    fireEvent.click(
        screen.getByRole("button", { name: "assistantDirectory.updates" }),
    );
    expect(names()).toEqual(["Amal", "Zora 10", "Zora 2"]);
    expect(screen.getByText("Atlas")).toBeInTheDocument();
});
it("combines text, status and access filters and preserves them when returning from a profile", () => {
    localStorage.setItem("assistant-directory-view", "list");
    const select = jest.fn();
    const renderDirectory = () =>
        render(<AssistantDirectory assistants={team} onSelect={select} />);
    renderDirectory();
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Beacon" },
    });
    fireEvent.change(
        screen.getByRole("combobox", { name: "assistantDirectory.status" }),
        { target: { value: "active" } },
    );
    fireEvent.change(
        screen.getByRole("combobox", { name: "assistantDirectory.role" }),
        { target: { value: "public" } },
    );
    expect(names()).toEqual(["Amal"]);
    fireEvent.click(screen.getByRole("button", { name: "Amal" }));
    expect(select).toHaveBeenCalledTimes(1);
    cleanup();
    renderDirectory();
    expect(names()).toEqual(["Amal"]);
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "missing" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
        "assistantDirectory.noMatches",
    );
    fireEvent.click(
        screen.getByRole("button", { name: "assistantDirectory.clearFilters" }),
    );
    expect(names()).toHaveLength(3);
});
it("keeps keyboard-accessible name buttons for a large RTL directory", () => {
    const select = jest.fn();
    render(
        <LanguageContext.Provider value={{ direction: "rtl" }}>
            <AssistantDirectory assistants={items(60)} onSelect={select} />
        </LanguageContext.Provider>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(61);
    const button = screen.getByRole("button", { name: "Assistant 20" });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: "20" }));
});

it("renders one page for 10,000 assistants and sends searches and paging to the server", async () => {
    const { useAssistantDirectory } = require("../../hooks/useColleagues");
    useAssistantDirectory.mockReturnValue({
        data: { colleagues: items(50), total: 10000, nextOffset: 50 },
    });
    render(<AssistantDirectory remote onSelect={() => {}} />);
    expect(screen.getByRole("navigation")).toHaveAttribute(
        "data-layout",
        "list",
    );
    expect(screen.getAllByRole("row")).toHaveLength(51);
    fireEvent.click(
        screen.getByRole("button", { name: "assistantDirectory.next" }),
    );
    expect(useAssistantDirectory).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 50, limit: 50 }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Research" },
    });
    await waitFor(() =>
        expect(useAssistantDirectory).toHaveBeenLastCalledWith(
            expect.objectContaining({ query: "Research", offset: 0 }),
        ),
    );
});
