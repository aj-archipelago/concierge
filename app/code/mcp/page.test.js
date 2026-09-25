/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import CustomMcpCallbackPage from "./page";

jest.mock("next/navigation", () => ({ useSearchParams: jest.fn() }));

describe("custom MCP callback correlation", () => {
    const originalChannel = global.BroadcastChannel;
    let postMessage;
    beforeEach(() => {
        postMessage = jest.fn();
        global.BroadcastChannel = jest.fn(() => ({
            postMessage,
            close: jest.fn(),
        }));
        jest.spyOn(window, "close").mockImplementation(() => {});
    });
    afterEach(() => {
        global.BroadcastChannel = originalChannel;
        jest.restoreAllMocks();
    });

    test("broadcasts the OAuth state without sending credentials", async () => {
        useSearchParams.mockReturnValue(
            new URLSearchParams("code=test&state=custom_mcp_test"),
        );
        global.fetch = jest.fn().mockResolvedValue({
            json: async () => ({
                success: true,
                serverId: "custom-example",
            }),
        });
        render(<CustomMcpCallbackPage />);
        await waitFor(() =>
            expect(postMessage).toHaveBeenCalledWith({
                type: "custom-example-oauth-complete",
                state: "custom_mcp_test",
                success: true,
            }),
        );
    });

    test("correlates denied authorization to the waiting client", async () => {
        useSearchParams.mockReturnValue(
            new URLSearchParams("error=access_denied&state=custom_mcp_test"),
        );
        render(<CustomMcpCallbackPage />);
        await waitFor(() =>
            expect(postMessage).toHaveBeenCalledWith({
                type: "mcp-oauth-complete",
                state: "custom_mcp_test",
                success: false,
                error: "Authorization was denied",
            }),
        );
    });
});
