import React from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import AutomationHtmlFrame, {
    clearAutomationHtmlCache,
} from "./AutomationHtmlFrame";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../../contexts/ThemeProvider", () => {
    const React = require("react");
    return {
        ThemeContext: React.createContext({ theme: "light" }),
    };
});

function mockHtmlResponse(html) {
    return {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(html),
    };
}

describe("AutomationHtmlFrame", () => {
    beforeEach(() => {
        clearAutomationHtmlCache();
        global.fetch = jest.fn();
    });

    it("shows a loading state until fetched HTML finishes loading in the iframe", async () => {
        global.fetch.mockResolvedValueOnce(
            mockHtmlResponse(
                "<html><head></head><body>Run output</body></html>",
            ),
        );

        render(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-1"
                className="h-64"
            />,
        );

        expect(
            screen.getByText("Loading automation content..."),
        ).toBeInTheDocument();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

        const frame = await screen.findByTitle("Automation HTML output");
        expect(frame).toHaveAttribute(
            "srcdoc",
            expect.stringContaining("Run output"),
        );
        expect(frame).toHaveAttribute(
            "srcdoc",
            expect.stringContaining("Content-Security-Policy"),
        );

        fireEvent.load(frame);

        expect(
            screen.queryByText("Loading automation content..."),
        ).not.toBeInTheDocument();
        expect(frame).toHaveClass("opacity-100");
    });

    it("replaces generated CSP metadata with the automation frame policy", async () => {
        global.fetch.mockResolvedValueOnce(
            mockHtmlResponse(
                `<html><head><meta http-equiv="Content-Security-Policy" content="default-src *; script-src 'unsafe-inline'"></head><body>Run output</body></html>`,
            ),
        );

        render(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-1"
                className="h-64"
            />,
        );

        const frame = await screen.findByTitle("Automation HTML output");
        const srcDoc = frame.getAttribute("srcdoc");

        expect(srcDoc).toContain(
            `Content-Security-Policy" content="default-src 'none';`,
        );
        expect(srcDoc).not.toContain("default-src *");
        expect(srcDoc).not.toContain("script-src");
    });

    it("resets the loading state when the run changes", async () => {
        global.fetch
            .mockResolvedValueOnce(mockHtmlResponse("<html>Run one</html>"))
            .mockResolvedValueOnce(mockHtmlResponse("<html>Run two</html>"));

        const { rerender } = render(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-1"
                className="h-64"
            />,
        );

        const firstFrame = await screen.findByTitle("Automation HTML output");
        fireEvent.load(firstFrame);
        expect(
            screen.queryByText("Loading automation content..."),
        ).not.toBeInTheDocument();

        rerender(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-2"
                className="h-64"
            />,
        );

        expect(
            screen.getByText("Loading automation content..."),
        ).toBeInTheDocument();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
        expect(global.fetch).toHaveBeenLastCalledWith(
            "/api/automations/automation-1/runs/run-2/html",
            { credentials: "include" },
        );
    });

    it("remounts the iframe when a different run returns identical HTML", async () => {
        const identicalHtml = "<html>Same run output</html>";
        global.fetch
            .mockResolvedValueOnce(mockHtmlResponse(identicalHtml))
            .mockResolvedValueOnce(mockHtmlResponse(identicalHtml));

        const { rerender } = render(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-1"
                className="h-64"
            />,
        );

        const firstFrame = await screen.findByTitle("Automation HTML output");
        fireEvent.load(firstFrame);
        expect(
            screen.queryByText("Loading automation content..."),
        ).not.toBeInTheDocument();

        rerender(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-2"
                className="h-64"
            />,
        );

        expect(
            screen.getByText("Loading automation content..."),
        ).toBeInTheDocument();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

        const secondFrame = await screen.findByTitle("Automation HTML output");
        expect(secondFrame).not.toBe(firstFrame);

        fireEvent.load(secondFrame);
        expect(
            screen.queryByText("Loading automation content..."),
        ).not.toBeInTheDocument();
    });

    it("reuses cached HTML for the same concrete run", async () => {
        global.fetch.mockResolvedValueOnce(
            mockHtmlResponse("<html>Cached run</html>"),
        );

        const { unmount } = render(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-1"
                className="h-64"
            />,
        );

        await screen.findByTitle("Automation HTML output");
        expect(global.fetch).toHaveBeenCalledTimes(1);
        unmount();

        render(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-1"
                className="h-64"
            />,
        );

        const frame = await screen.findByTitle("Automation HTML output");
        expect(frame).toHaveAttribute(
            "srcdoc",
            expect.stringContaining("Cached run"),
        );
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("refetches when the cache version changes", async () => {
        global.fetch
            .mockResolvedValueOnce(mockHtmlResponse("<html>Old run</html>"))
            .mockResolvedValueOnce(
                mockHtmlResponse("<html>Updated run</html>"),
            );

        const { rerender } = render(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-1"
                cacheVersion="v1"
            />,
        );

        await screen.findByTitle("Automation HTML output");

        rerender(
            <AutomationHtmlFrame
                automationId="automation-1"
                taskId="run-1"
                cacheVersion="v2"
            />,
        );

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
        const frame = screen.getByTitle("Automation HTML output");
        await waitFor(() =>
            expect(frame).toHaveAttribute(
                "srcdoc",
                expect.stringContaining("Updated run"),
            ),
        );
    });

    it("shares in-flight requests for the same concrete run", async () => {
        let resolveFetch;
        global.fetch.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveFetch = resolve;
            }),
        );

        render(
            <>
                <AutomationHtmlFrame
                    automationId="automation-1"
                    taskId="run-1"
                />
                <AutomationHtmlFrame
                    automationId="automation-1"
                    taskId="run-1"
                />
            </>,
        );

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

        await act(async () => {
            resolveFetch(mockHtmlResponse("<html>Shared run</html>"));
        });

        const frames = await screen.findAllByTitle("Automation HTML output");
        expect(frames).toHaveLength(2);
        expect(frames[0]).toHaveAttribute(
            "srcdoc",
            expect.stringContaining("Shared run"),
        );
        expect(frames[1]).toHaveAttribute(
            "srcdoc",
            expect.stringContaining("Shared run"),
        );
    });

    it("does not cache the latest alias", async () => {
        global.fetch
            .mockResolvedValueOnce(mockHtmlResponse("<html>Latest one</html>"))
            .mockResolvedValueOnce(mockHtmlResponse("<html>Latest two</html>"));

        const { unmount } = render(
            <AutomationHtmlFrame automationId="automation-1" taskId="latest" />,
        );

        await screen.findByTitle("Automation HTML output");
        unmount();

        render(
            <AutomationHtmlFrame automationId="automation-1" taskId="latest" />,
        );

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    });
});
