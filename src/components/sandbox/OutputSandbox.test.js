import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import OutputSandbox from "./OutputSandbox";

// Mock the convertMessageToMarkdown function
jest.mock("../chat/ChatMessage", () => ({
    convertMessageToMarkdown: jest.fn((message) => {
        return {
            type: "div",
            props: {
                "data-testid": "markdown-component",
                "data-payload": message.payload,
                "data-citations": message.tool,
                children: "Mocked Markdown Component",
            },
        };
    }),
}));

describe("OutputSandbox", () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    it("should render iframe with content", () => {
        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toBeInTheDocument();
        expect(iframe).toHaveAttribute("srcdoc");
    });

    it("should render loading state initially", () => {
        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        const loadingText = screen.getByText("Loading...");
        expect(loadingText).toBeInTheDocument();
    });

    it("should include pre elements in srcdoc", () => {
        const jsonContent = {
            markdown: "# Test Heading\n\nThis is a test paragraph.",
            citations: [
                { id: 1, text: "Citation 1" },
                { id: 2, text: "Citation 2" },
            ],
        };

        const content = `
            <div>
                <h1>Test Page</h1>
                <pre class="llm-output">${JSON.stringify(jsonContent)}</pre>
                <p>Other content</p>
            </div>
        `;

        render(<OutputSandbox content={content} />);

        const iframe = screen.getByTitle("Output Sandbox");
        const srcdoc = iframe.getAttribute("srcdoc");

        // Check that the pre element is included in the srcdoc
        expect(srcdoc).toContain('pre class="llm-output"');
        expect(srcdoc).toContain(JSON.stringify(jsonContent));
    });

    it("should have proper iframe attributes", () => {
        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toHaveAttribute(
            "sandbox",
            "allow-scripts allow-popups allow-forms allow-same-origin allow-downloads allow-presentation",
        );
        expect(iframe).toHaveAttribute("title", "Output Sandbox");
    });

    it("should accept custom height prop", () => {
        const content = "<div>Test content</div>";
        const customHeight = "500px";
        render(<OutputSandbox content={content} height={customHeight} />);

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toHaveStyle(`height: ${customHeight}`);
    });
});
