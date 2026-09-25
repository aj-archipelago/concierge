import React from "react";
import { render, screen } from "@testing-library/react";
import { renderChatMarkdownMessage } from "../chatMarkdownRenderer";

jest.mock("react-markdown", () => ({
    __esModule: true,
    default: ({ children, components }) => {
        const [, label, href] = children.match(/\[([^\]]+)\]\(([^)]+)\)/);
        const Link = components.a;
        return <Link href={href}>{label}</Link>;
    },
}));
jest.mock("../../code/CodeBlock", () => () => null);
jest.mock("../../code/HtmlCodeBlock", () => () => null);
jest.mock("../../code/MermaidDiagram", () => () => null);
jest.mock("../../code/MermaidPlaceholder", () => () => null);
jest.mock("../TextWithCitations", () => () => null);
jest.mock("../InlineEmotionDisplay", () => () => null);
jest.mock("../chatMarkdownMedia", () => ({
    MarkdownImageRenderer: () => null,
}));

describe("chat artifact links", () => {
    it.each([true, false])(
        "refreshes saved file links (final render: %s)",
        (finalRender) => {
            const href =
                "https://examplefiles.blob.core.windows.net/files/chats/test/report.pdf?se=2020-01-01&sig=expired";
            render(
                renderChatMarkdownMessage({
                    message: { payload: `[Download PDF](${href})` },
                    finalRender,
                }),
            );

            const link = screen.getByRole("link", { name: "Download PDF" });
            const target = new URL(
                link.getAttribute("href"),
                "http://localhost",
            );
            expect(target.pathname).toBe("/api/image-proxy");
            expect(target.searchParams.get("url")).toBe(href);
            expect(target.searchParams.get("download")).toBe("1");
        },
    );

    it.each([
        "https://example.com/report.pdf",
        "https://external.blob.core.windows.net/files/report.pdf",
        "https://examplefiles.blob.core.windows.net.evil.example/report.pdf",
        "/help",
        "#section",
    ])("preserves ordinary links: %s", (href) => {
        render(
            renderChatMarkdownMessage({
                message: { payload: `[Read](${href})` },
            }),
        );
        expect(
            screen.getByRole("link", { name: "Read" }).getAttribute("href"),
        ).toBe(href);
    });
});
