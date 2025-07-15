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

    it("should render iframe with content", async () => {
        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toBeInTheDocument();

        // Wait for the async setupFrame to complete
        await waitFor(() => {
            expect(iframe).toHaveAttribute("srcdoc");
        });
    });

    it("should render loading state initially", async () => {
        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        const loadingText = screen.getByText("Loading...");
        expect(loadingText).toBeInTheDocument();

        // Wait for loading to complete to avoid act warnings
        await waitFor(() => {
            expect(screen.getByTitle("Output Sandbox")).toHaveAttribute(
                "srcdoc",
            );
        });
    });

    it("should include pre elements in srcdoc", async () => {
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

        // Wait for the async setupFrame to complete
        await waitFor(() => {
            const srcdoc = iframe.getAttribute("srcdoc");
            expect(srcdoc).toBeTruthy();
        });

        // Now check the content
        const srcdoc = iframe.getAttribute("srcdoc");
        expect(srcdoc).toContain('pre class="llm-output"');
        expect(srcdoc).toContain(JSON.stringify(jsonContent));
    });

    it("should have proper iframe attributes", async () => {
        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toHaveAttribute(
            "sandbox",
            "allow-scripts allow-popups allow-forms allow-same-origin allow-downloads allow-presentation",
        );
        expect(iframe).toHaveAttribute("title", "Output Sandbox");

        // Wait for async operations to complete
        await waitFor(() => {
            expect(iframe).toHaveAttribute("srcdoc");
        });
    });

    it("should accept custom height prop", async () => {
        const content = "<div>Test content</div>";
        const customHeight = "500px";
        render(<OutputSandbox content={content} height={customHeight} />);

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toHaveStyle(`height: ${customHeight}`);

        // Wait for async operations to complete
        await waitFor(() => {
            expect(iframe).toHaveAttribute("srcdoc");
        });
    });
});
