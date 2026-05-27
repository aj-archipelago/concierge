import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { convertMessageToMarkdown } from "../ChatMessage";

let mediaCardMounts = 0;
let mediaCardUnmounts = 0;

jest.mock("react-markdown", () => {
    const React = require("react");
    return {
        __esModule: true,
        default: ({ children, components = {}, className }) => {
            const markdown =
                typeof children === "string"
                    ? children
                    : String(children || "");
            const match = markdown.match(/!\[(.*?)\]\((.*?)\)/);

            if (match && components.img) {
                const Img = components.img;
                return React.createElement(
                    "div",
                    { className, "data-testid": "markdown" },
                    React.createElement(Img, {
                        src: match[2],
                        alt: match[1],
                    }),
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
jest.mock("../../code/MermaidDiagram", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("../../code/MermaidPlaceholder", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("../MediaCard", () => {
    const React = require("react");
    function MockMediaCard({ filename }) {
        React.useEffect(() => {
            mediaCardMounts += 1;
            return () => {
                mediaCardUnmounts += 1;
            };
        }, []);

        return <div data-testid="media-card">{filename}</div>;
    }

    return {
        __esModule: true,
        default: MockMediaCard,
    };
});

function MarkdownHost({ payload }) {
    return convertMessageToMarkdown({
        payload,
        tool: null,
        sender: "assistant",
    });
}

describe("ChatMessage streaming image rendering", () => {
    beforeEach(() => {
        mediaCardMounts = 0;
        mediaCardUnmounts = 0;
    });

    it("keeps markdown images mounted when later chunks extend the same message", () => {
        const { rerender } = render(
            <MarkdownHost payload="![chart](https://example.com/chart.png)" />,
        );

        expect(screen.getByTestId("media-card")).toBeInTheDocument();
        expect(mediaCardMounts).toBe(1);
        expect(mediaCardUnmounts).toBe(0);

        rerender(
            <MarkdownHost payload="![chart](https://example.com/chart.png)\n\nMore analysis" />,
        );

        expect(screen.getByTestId("media-card")).toBeInTheDocument();
        expect(mediaCardMounts).toBe(1);
        expect(mediaCardUnmounts).toBe(0);
    });
});
