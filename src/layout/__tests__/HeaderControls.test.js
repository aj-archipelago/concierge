import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Plus, Clock } from "lucide-react";
import { HeaderAction, HeaderTabs } from "../HeaderControls";
import { LanguageContext } from "../../contexts/LanguageProvider";

jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));

test("compact actions retain their accessible names and button behavior", () => {
    const onClick = jest.fn();
    render(<HeaderAction icon={Plus} label="Assign task" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Assign task" });
    expect(button).toHaveAttribute("title", "Assign task");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
});

test("navigation actions remain real links", () => {
    render(
        <HeaderAction
            href="/colleagues?view=tasks"
            icon={Plus}
            label="All tasks"
        />,
    );
    expect(screen.getByRole("link", { name: "All tasks" })).toHaveAttribute(
        "href",
        "/colleagues?view=tasks",
    );
});

test.each([
    ["ltr", "ArrowRight"],
    ["rtl", "ArrowLeft"],
])(
    "tabs follow %s keyboard direction and retain notification badges",
    (direction, forward) => {
        const onChange = jest.fn();
        render(
            <LanguageContext.Provider value={{ direction }}>
                <HeaderTabs
                    label="Tasks"
                    value="recent"
                    onChange={onChange}
                    items={[
                        {
                            value: "recent",
                            label: "Recent",
                            icon: Clock,
                            badge: <span>3</span>,
                        },
                        { value: "tasks", label: "All tasks" },
                        { value: "team", label: "Assistants" },
                    ]}
                />
            </LanguageContext.Provider>,
        );
        const recent = screen.getByRole("button", { name: "Recent" });
        expect(recent).toHaveAttribute("aria-pressed", "true");
        expect(recent).toHaveTextContent("3");
        fireEvent.keyDown(recent, { key: forward });
        expect(screen.getByRole("button", { name: "All tasks" })).toHaveFocus();
        expect(onChange).toHaveBeenLastCalledWith("tasks");
        fireEvent.keyDown(screen.getByRole("button", { name: "All tasks" }), {
            key: "End",
        });
        expect(
            screen.getByRole("button", { name: "Assistants" }),
        ).toHaveFocus();
        fireEvent.keyDown(screen.getByRole("button", { name: "Assistants" }), {
            key: "Home",
        });
        expect(recent).toHaveFocus();
    },
);
