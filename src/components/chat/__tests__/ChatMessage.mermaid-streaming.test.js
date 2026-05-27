import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { convertMessageToMarkdown } from "../ChatMessage";

jest.mock("react-markdown", () => {
    const React = require("react");
    return {
        __esModule: true,
        default: ({ children, components = {}, className }) => {
            const markdown =
                typeof children === "string"
                    ? children
                    : String(children || "");
            const fenceMatch = markdown.match(/```(\w+)\n?([\s\S]*?)```/);

            if (fenceMatch && components.code) {
                const codeElement = React.createElement(components.code, {
                    className: `language-${fenceMatch[1]}`,
                    children: fenceMatch[2],
                });
                const content = components.pre
                    ? React.createElement(components.pre, null, codeElement)
                    : codeElement;

                return React.createElement(
                    "div",
                    { className, "data-testid": "markdown" },
                    content,
                );
            }

            return React.createElement(
                "div",
                { className, "data-testid": "markdown" },
                markdown,
            );
        },
    };
});

jest.mock("remark-directive", () => ({
    __esModule: true,
    default: () => () => {},
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => () => {} }));
jest.mock("remark-math", () => ({ __esModule: true, default: () => () => {} }));
jest.mock("rehype-katex", () => ({
    __esModule: true,
    default: () => (tree) => tree,
}));
jest.mock("rehype-raw", () => ({
    __esModule: true,
    default: () => (tree) => tree,
}));
jest.mock("katex/dist/katex.min.css", () => ({}));
jest.mock("unist-util-visit", () => ({
    visit: () => {},
}));

jest.mock("i18next-browser-languagedetector", () => ({
    __esModule: true,
    default: () => {},
}));

jest.mock("react-i18next", () => ({
    __esModule: true,
    initReactI18next: {},
}));

jest.mock("i18next", () => {
    const mockI18n = {
        t: jest.fn((key) => key),
        language: "en",
        use: jest.fn(function () {
            return this;
        }),
        init: jest.fn(function () {
            return this;
        }),
    };

    return {
        __esModule: true,
        default: mockI18n,
    };
});

jest.mock("../../code/CodeBlock", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("../../code/HtmlCodeBlock", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("../TextWithCitations", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("../InlineEmotionDisplay", () => ({
    __esModule: true,
    default: ({ children }) => <>{children}</>,
}));
jest.mock("../MediaCard", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("../../code/MermaidDiagram", () => ({
    __esModule: true,
    default: ({ code }) => <div data-testid="mermaid-diagram">{code}</div>,
}));
jest.mock("../../code/MermaidPlaceholder", () => ({
    __esModule: true,
    default: () => (
        <div data-testid="mermaid-placeholder">Loading chart...</div>
    ),
}));

const renderMessage = (payload, finalRender) =>
    render(
        convertMessageToMarkdown(
            {
                payload,
                tool: null,
                sender: "assistant",
            },
            finalRender,
        ),
    );

describe("ChatMessage mermaid streaming", () => {
    it("shows the placeholder as soon as an open mermaid fence appears", () => {
        renderMessage("```mermaid\nflowchart TD\nA-->B", false);

        expect(screen.getByTestId("mermaid-placeholder")).toBeInTheDocument();
        expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    });

    it("keeps closed mermaid fences on the placeholder path while streaming", () => {
        renderMessage("```mermaid\nflowchart TD\nA-->B\n```", false);

        expect(screen.getByTestId("mermaid-placeholder")).toBeInTheDocument();
        expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
    });

    it("renders the mermaid diagram once the final render is requested", () => {
        renderMessage("```mermaid\nflowchart TD\nA-->B\n```", true);

        expect(screen.getByTestId("mermaid-diagram")).toHaveTextContent(
            /flowchart TD\s+A-->B/,
        );
        expect(
            screen.queryByTestId("mermaid-placeholder"),
        ).not.toBeInTheDocument();
    });
});
