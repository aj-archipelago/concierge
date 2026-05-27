/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, renderHook } from "@testing-library/react";
import { PageContextProvider, usePageContext } from "../PageContextProvider";

let mockPathname = "/chat/123";

jest.mock("next/navigation", () => ({
    usePathname: () => mockPathname,
}));

describe("PageContextProvider", () => {
    const wrapper = ({ children }) => (
        <PageContextProvider>{children}</PageContextProvider>
    );

    beforeEach(() => {
        mockPathname = "/chat/123";
    });

    test("merges tools and handlers from multiple sources and clears them independently", () => {
        const getHandler = jest.fn();
        const deleteHandler = jest.fn();
        const { result } = renderHook(() => usePageContext(), { wrapper });

        act(() => {
            result.current.setPageContext(
                [{ function: { name: "ListApplets" } }],
                null,
                { listapplets: getHandler },
                null,
                "chat-page",
            );
        });

        act(() => {
            result.current.setPageContext(
                [{ function: { name: "DeleteApplet" } }],
                null,
                { deleteapplet: deleteHandler },
                null,
                "chat-canvas",
            );
        });

        expect(
            result.current.contextualTools.map((tool) => tool.function?.name),
        ).toEqual(["ListApplets", "DeleteApplet"]);
        expect(result.current.toolHandlers).toMatchObject({
            listapplets: getHandler,
            deleteapplet: deleteHandler,
        });

        act(() => {
            result.current.clearPageContext("chat-canvas");
        });

        expect(
            result.current.contextualTools.map((tool) => tool.function?.name),
        ).toEqual(["ListApplets"]);
        expect(result.current.toolHandlers).toMatchObject({
            listapplets: getHandler,
        });
        expect(result.current.toolHandlers.deleteapplet).toBeUndefined();
    });

    test("clears page context and model override when the route changes", () => {
        const { result, rerender } = renderHook(() => usePageContext(), {
            wrapper,
        });

        act(() => {
            result.current.setPageContext(
                [{ function: { name: "ListApplets" } }],
                "chat context",
                {},
                () => "dynamic context",
                "chat-page",
            );
            result.current.setModelOverride("gpt-5.4");
        });

        expect(result.current.contextualTools).toHaveLength(1);
        expect(result.current.pageContext).toBe("chat context");
        expect(result.current.pageContextGetter()).toBe("dynamic context");
        expect(result.current.modelOverride).toBe("gpt-5.4");

        mockPathname = "/write/456";
        rerender();

        expect(result.current.contextualTools).toEqual([]);
        expect(result.current.pageContext).toBeNull();
        expect(result.current.pageContextGetter).toBeNull();
        expect(result.current.toolHandlers).toEqual({});
        expect(result.current.modelOverride).toBeNull();
    });

    test("keeps newly registered same-source context after route change", () => {
        const { result, rerender } = renderHook(() => usePageContext(), {
            wrapper,
        });

        act(() => {
            result.current.setPageContext(
                [{ function: { name: "OldChatTool" } }],
                null,
                {},
                null,
                "chat-page",
            );
        });

        mockPathname = "/chat/new";
        rerender();

        expect(result.current.contextualTools).toEqual([]);

        act(() => {
            result.current.setPageContext(
                [{ function: { name: "ListApplets" } }],
                null,
                {},
                null,
                "chat-page",
            );
        });

        expect(
            result.current.contextualTools.map((tool) => tool.function?.name),
        ).toEqual(["ListApplets"]);
    });
});
