import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ActiveToolsList, {
    getActiveToolsPopoverStyle,
} from "../ActiveToolsList";

let mockContextualTools = [];
let mockConfiguredConnections = [];
let mockCanvasContent = null;
const mockHandleConnectPreset = jest.fn();

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key, options) => options?.defaultValue || key,
    }),
}));

jest.mock("next/navigation", () => ({
    usePathname: () => "/chat",
}));

jest.mock("react-redux", () => ({
    useSelector: (selector) =>
        selector({ chat: { canvasContent: mockCanvasContent } }),
}));

jest.mock("../../../contexts/PageContextProvider", () => ({
    usePageContext: () => ({
        contextualTools: mockContextualTools,
    }),
}));

jest.mock("../../../contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

jest.mock("../../../hooks/useMcpServers", () => ({
    useMcpServers: () => ({
        configuredConnections: mockConfiguredConnections,
        handleConnectPreset: mockHandleConnectPreset,
        loading: false,
    }),
}));

jest.mock("../../../utils/clientSideTools", () => ({
    CLIENT_SIDE_TOOLS: [
        {
            icon: "G",
            function: {
                name: "GlobalTool",
                description: "Global tool description",
            },
        },
    ],
    filterToolsByRoute: (_pathname, tools) => tools,
}));

describe("ActiveToolsList", () => {
    beforeEach(() => {
        mockContextualTools = [
            {
                icon: "P",
                function: {
                    name: "PageTool",
                    description: "Page tool description",
                },
            },
        ];
        mockConfiguredConnections = [
            {
                serverId: "slack",
                displayName: "Slack",
                status: "expired",
            },
        ];
        mockCanvasContent = null;
        mockHandleConnectPreset.mockClear();
    });

    it("opens and closes the tools popover without Radix trigger state", () => {
        render(<ActiveToolsList />);

        const trigger = screen.getByTitle("View available tools");
        expect(trigger).toHaveAttribute("type", "button");
        expect(trigger).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(trigger);

        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(
            screen.getByRole("dialog", { name: "Available Tools" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Global Tool")).toBeInTheDocument();
        expect(screen.getByText("Page Tool")).toBeInTheDocument();
        expect(screen.getByText("Slack")).toBeInTheDocument();

        fireEvent.keyDown(document, { key: "Escape" });

        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(
            screen.queryByRole("dialog", { name: "Available Tools" }),
        ).not.toBeInTheDocument();
    });

    it("stays stable across repeated parent rerenders with new canvas objects", () => {
        const { rerender } = render(<ActiveToolsList displayState="docked" />);

        for (let index = 0; index < 10; index += 1) {
            mockCanvasContent = { appletId: `applet-${index}` };
            mockContextualTools = [...mockContextualTools];
            rerender(<ActiveToolsList displayState="docked" />);
        }

        expect(screen.getByTitle("View available tools")).toBeInTheDocument();
    });

    it("clamps popover placement inside the viewport", () => {
        expect(
            getActiveToolsPopoverStyle(
                { left: 2, right: 26, top: 40, bottom: 64 },
                {
                    viewportWidth: 280,
                    viewportHeight: 640,
                    alignStart: false,
                },
            ),
        ).toMatchObject({
            left: 8,
            width: 264,
        });
    });

    it("opens above the trigger when there is not enough room below", () => {
        const style = getActiveToolsPopoverStyle(
            { left: 100, right: 124, top: 210, bottom: 234 },
            {
                viewportWidth: 400,
                viewportHeight: 260,
                alignStart: true,
            },
        );

        expect(style.top).toBeLessThan(210);
        expect(style.top).toBeGreaterThanOrEqual(8);
    });
});
