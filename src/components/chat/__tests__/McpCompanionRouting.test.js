import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { McpConfigContent } from "../McpConfigDialog";
import { useMcpServers } from "../../../hooks/useMcpServers";
import LocalComputers from "../LocalComputers";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("../../../hooks/useMcpServers");
jest.mock("../../../contexts/ThemeProvider", () => ({
    ThemeContext: require("react").createContext({ theme: "light" }),
}));
jest.mock("../LocalComputers", () => jest.fn(() => null));

describe("one connector form for computer and cloud tools", () => {
    let addCloud;
    beforeEach(() => {
        jest.clearAllMocks();
        addCloud = jest.fn().mockResolvedValue({ serverId: "custom-cloud" });
        useMcpServers.mockReturnValue({
            mcpServers: {},
            getConnectionStatus: () => "disconnected",
            handleAddCustomServer: addCloud,
        });
    });
    function fill(url) {
        render(<McpConfigContent />);
        fireEvent.click(screen.getByRole("button", { name: "Add server" }));
        fireEvent.change(screen.getByPlaceholderText("Name (e.g. My Server)"), {
            target: { value: "My tool" },
        });
        fireEvent.change(screen.getByPlaceholderText("mcp_url_placeholder"), {
            target: { value: url },
        });
    }
    it("hands private endpoints to Companion and removes the unavailable OAuth action", async () => {
        fill("http://localhost:3001/mcp");
        expect(
            screen.queryByRole("button", { name: "Add & connect OAuth" }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole("button", { name: "Continue in Companion" }),
        );
        await waitFor(() =>
            expect(LocalComputers.mock.calls.at(-1)[0].intent).toMatchObject({
                kind: "server",
                name: "My tool",
                url: "http://localhost:3001/mcp",
            }),
        );
        expect(addCloud).not.toHaveBeenCalled();
    });
    it("retains cloud OAuth without requiring a desktop connection", async () => {
        fill("https://mcp.example.com/mcp");
        fireEvent.click(
            screen.getByRole("button", { name: "Add & connect OAuth" }),
        );
        await waitFor(() =>
            expect(addCloud).toHaveBeenCalledWith({
                name: "My tool",
                url: "https://mcp.example.com/mcp",
                token: "",
                connectWithOAuth: true,
            }),
        );
        expect(LocalComputers.mock.calls.at(-1)[0].intent).toBeNull();
    });
});
