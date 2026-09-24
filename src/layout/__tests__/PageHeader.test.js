import "@testing-library/jest-dom";
import React, { createContext, useContext, useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PageHeader from "../PageHeader";
import { AppHeaderContext } from "../../contexts/AppHeaderContext";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

const PageState = createContext("missing");
function Action() {
    const context = useContext(PageState);
    const [count, setCount] = useState(0);
    return (
        <button onClick={() => setCount((value) => value + 1)}>
            {context} {count}
        </button>
    );
}

test("hosts page controls without losing context or local state and releases them on navigation", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const release = jest.fn();
    const register = jest.fn(() => release);
    const header = { target, register };
    const view = render(
        <AppHeaderContext.Provider value={header}>
            <PageState.Provider value="Edit">
                <PageHeader title="Home">
                    <Action />
                </PageHeader>
            </PageState.Provider>
        </AppHeaderContext.Provider>,
    );
    expect(within(target).getByRole("heading", { name: "Home" })).toBeVisible();
    fireEvent.click(within(target).getByRole("button", { name: "Edit 0" }));
    expect(
        within(target).getByRole("button", { name: "Edit 1" }),
    ).toBeVisible();
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(
        <AppHeaderContext.Provider value={header}>
            <PageHeader title="Files" />
        </AppHeaderContext.Provider>,
    );
    expect(within(target).queryByRole("button")).not.toBeInTheDocument();
    expect(
        within(target).getByRole("heading", { name: "Files" }),
    ).toBeVisible();
    view.unmount();
    expect(target).toBeEmptyDOMElement();
    expect(release).toHaveBeenCalled();
    target.remove();
});

test("embedded headers remain inline and cannot replace the page header", () => {
    const target = document.createElement("div");
    const register = jest.fn();
    render(
        <AppHeaderContext.Provider value={{ target, register }}>
            <PageHeader title="Embedded chat" enabled={false}>
                <Action />
            </PageHeader>
        </AppHeaderContext.Provider>,
    );
    expect(
        screen.getByRole("heading", { name: "Embedded chat" }),
    ).toBeVisible();
    expect(target).toBeEmptyDOMElement();
    expect(register).not.toHaveBeenCalled();
});
