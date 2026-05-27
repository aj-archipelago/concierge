import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import HtmlCodeBlock from "../HtmlCodeBlock";
import MarkdownCodeBlock from "../MarkdownCodeBlock";

jest.mock("../../chat/chatMarkdownRenderer", () => ({
    __esModule: true,
    renderChatMarkdownMessage: jest.fn(({ message }) => (
        <div data-testid="rendered-markdown-preview">{message.payload}</div>
    )),
}));

describe("tabbed code previews", () => {
    it("lazy-mounts markdown preview, then keeps it mounted after the first visit", async () => {
        render(<MarkdownCodeBlock code={"# Heading\n\nBody"} />);

        expect(
            screen.queryByTestId("tabbed-code-block-preview-surface"),
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: "Preview" }));

        const preview = screen.getByTestId("tabbed-code-block-preview-surface");
        expect(preview).toBeInTheDocument();
        expect(preview).toHaveClass("markdown-preview");
        expect(
            screen.getByTestId("rendered-markdown-preview"),
        ).toHaveTextContent("# Heading");
        expect(
            within(
                screen.getByTestId("tabbed-code-block-code-surface"),
            ).queryByTestId("tabbed-code-block-preview-surface"),
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: "Code" }));

        expect(preview).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
            "aria-selected",
            "false",
        );
    });

    it("keeps html preview outside code-block whitespace wrappers", async () => {
        render(<HtmlCodeBlock code={"<strong>Hello</strong>"} />);

        expect(
            screen.queryByTestId("tabbed-code-block-preview-surface"),
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: "Preview" }));

        const preview = screen.getByTestId("tabbed-code-block-preview-surface");
        expect(preview).toBeInTheDocument();
        expect(preview).toHaveClass("html-preview");
        expect(within(preview).getByText("Hello")).toBeInTheDocument();
        expect(
            within(
                screen.getByTestId("tabbed-code-block-code-surface"),
            ).queryByTestId("tabbed-code-block-preview-surface"),
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: "Code" }));

        expect(preview).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
            "aria-selected",
            "false",
        );
    });
});
