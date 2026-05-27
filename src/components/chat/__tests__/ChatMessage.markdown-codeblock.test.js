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
            const fenceMatch = markdown.match(/```([\w-]+)\n?([\s\S]*?)```/);

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
    default: ({ code, language }) => (
        <div data-testid="code-block" data-language={language}>
            {code}
        </div>
    ),
}));
jest.mock("../../code/HtmlCodeBlock", () => ({
    __esModule: true,
    default: ({ code }) => <div data-testid="html-code-block">{code}</div>,
}));
jest.mock("../../code/MarkdownCodeBlock", () => ({
    __esModule: true,
    default: ({ code }) => <div data-testid="markdown-code-block">{code}</div>,
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
    default: () => null,
}));
jest.mock("../../code/MermaidPlaceholder", () => ({
    __esModule: true,
    default: () => null,
}));

describe("ChatMessage markdown code blocks", () => {
    it("renders fenced md blocks with the markdown preview component", () => {
        render(
            convertMessageToMarkdown({
                payload: "```md\n# Heading\n\nSome text\n```",
                tool: null,
                sender: "assistant",
            }),
        );

        expect(screen.getByTestId("markdown-code-block")).toHaveTextContent(
            "# Heading",
        );
        expect(screen.queryByTestId("html-code-block")).not.toBeInTheDocument();
    });

    it("does not treat markdown fences containing HTML as html preview blocks", () => {
        render(
            convertMessageToMarkdown({
                payload: "```markdown\n# Heading\n<details>More</details>\n```",
                tool: null,
                sender: "assistant",
            }),
        );

        expect(screen.getByTestId("markdown-code-block")).toHaveTextContent(
            "<details>More</details>",
        );
        expect(screen.queryByTestId("html-code-block")).not.toBeInTheDocument();
    });
});
