import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import OutputSandbox from "./OutputSandbox";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("@/src/contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({
        language: "en",
        direction: "ltr",
    }),
}));

jest.mock("next/navigation", () => ({
    useSearchParams: jest.fn(() => new URLSearchParams("")),
}));

// Mock the convertMessageToMarkdown function
jest.mock("../chat/ChatMessage", () => {
    const React = require("react");
    return {
        convertMessageToMarkdown: jest.fn((message) => {
            return React.createElement(
                "div",
                {
                    "data-testid": "markdown-component",
                    "data-payload": message.payload,
                    "data-citations": message.tool,
                },
                "Mocked Markdown Component",
            );
        }),
    };
});

// Helper: wait for the async content setup to finish.
// The component uses document.write (or srcdoc fallback), both of which
// eventually call setIsLoading(false) making the loading status disappear.
const waitForContentReady = async () => {
    await waitFor(() => {
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
};

describe("OutputSandbox", () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        const { useSearchParams } = require("next/navigation");
        useSearchParams.mockReturnValue(new URLSearchParams(""));
    });

    it("should render iframe with content", async () => {
        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toBeInTheDocument();

        await waitForContentReady();
    });

    it("should render loading state initially", async () => {
        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        const loadingStatus = screen.getByRole("status", {
            name: "Loading...",
        });
        expect(loadingStatus).toBeInTheDocument();
        expect(
            screen.getByTestId("output-sandbox-loading-spinner"),
        ).toHaveClass("animate-spin");

        await waitForContentReady();
    });

    it("should render pre elements with llm-output class without errors", async () => {
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
        expect(iframe).toBeInTheDocument();

        await waitForContentReady();
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

        await waitForContentReady();
    });

    it("should accept custom height prop", async () => {
        const content = "<div>Test content</div>";
        const customHeight = "500px";
        render(<OutputSandbox content={content} height={customHeight} />);

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toHaveStyle(`height: ${customHeight}`);

        await waitForContentReady();
    });

    it("can keep the iframe at a fixed height so its document scrolls internally", async () => {
        const content = "<div style='height:2000px'>Tall content</div>";
        render(
            <OutputSandbox
                content={content}
                height="100%"
                autoResize={false}
            />,
        );

        const iframe = screen.getByTitle("Output Sandbox");
        expect(iframe).toHaveStyle("height: 100%");
        expect(iframe).toHaveAttribute("scrolling", "auto");

        await waitForContentReady();
    });

    it("injects locale globals from LanguageContext", async () => {
        const React = require("react");
        const { LanguageContext } = require("@/src/contexts/LanguageProvider");
        const content = "<div>Test content</div>";

        render(
            <LanguageContext.Provider
                value={{ language: "ar", direction: "rtl" }}
            >
                <OutputSandbox content={content} />
            </LanguageContext.Provider>,
        );

        await waitForContentReady();

        const iframe = screen.getByTitle("Output Sandbox");
        const frameDoc =
            iframe.contentDocument || iframe.contentWindow?.document;
        expect(frameDoc?.documentElement.getAttribute("lang")).toBe("ar");
        expect(frameDoc?.documentElement.getAttribute("dir")).toBe("rtl");
        expect(frameDoc?.defaultView?.CONCIERGE_LANGUAGE).toBe("ar");
        expect(frameDoc?.defaultView?.CONCIERGE_DIRECTION).toBe("rtl");
    });

    it("injects APPLET_PARAMS from the page query string", async () => {
        const { useSearchParams } = require("next/navigation");
        useSearchParams.mockReturnValue(new URLSearchParams("foo=bar"));

        const content = "<div>Test content</div>";
        render(<OutputSandbox content={content} />);

        await waitForContentReady();

        const iframe = screen.getByTitle("Output Sandbox");
        const frameDoc =
            iframe.contentDocument || iframe.contentWindow?.document;
        expect(frameDoc?.defaultView?.APPLET_PARAMS).toEqual({ foo: "bar" });
    });
});
