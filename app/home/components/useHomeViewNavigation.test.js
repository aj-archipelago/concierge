import { act, renderHook } from "@testing-library/react";
import useHomeViewNavigation from "./useHomeViewNavigation";
import { installHomeHistory } from "./__testUtils__/homeHistory";

describe("Home navigation", () => {
    beforeEach(() => installHomeHistory());

    test("Back and Forward close and reopen the same card", () => {
        const { result } = renderHook(() => useHomeViewNavigation());
        act(() => result.current.open("open", "applet:calculator"));
        expect(result.current).toMatchObject({
            view: "open",
            itemId: "applet:calculator",
        });
        act(() => window.history.back());
        expect(result.current.view).toBeNull();
        act(() => window.history.forward());
        expect(result.current.itemId).toBe("applet:calculator");
        act(() => result.current.close());
        expect(window.location.pathname).toBe("/home");
        expect(result.current.view).toBeNull();
    });

    test("closing a direct link stays on Home and preserves other URL state", () => {
        installHomeHistory(
            "http://localhost/home?filter=mine&homeView=open&item=digest:1#reports",
            { next: "kept" },
        );
        const { result } = renderHook(() => useHomeViewNavigation());
        act(() => result.current.close());
        expect(window.location.href).toBe(
            "http://localhost/home?filter=mine#reports",
        );
        expect(window.history.state.next).toBe("kept");
        expect(window.history.back).not.toHaveBeenCalled();
    });

    test("moving from Add to task creation uses one return to Home", () => {
        const { result } = renderHook(() => useHomeViewNavigation());
        act(() => result.current.open("add", "group:1"));
        act(() => result.current.open("create-task"));
        expect(window.history.pushState).toHaveBeenCalledTimes(1);
        expect(result.current.view).toBe("create-task");
        act(() => result.current.close());
        expect(result.current.view).toBeNull();
    });

    test("duplicate close callbacks do not navigate past Home", () => {
        const { result } = renderHook(() => useHomeViewNavigation());
        act(() => result.current.open("add"));
        act(() => {
            result.current.close();
            result.current.close();
        });
        expect(window.location.pathname).toBe("/home");
        expect(result.current.view).toBeNull();
    });
});

test("Close dismisses immediately even if history never emits popstate", () => {
    installHomeHistory();
    const { result } = renderHook(() => useHomeViewNavigation());
    act(() => result.current.open("add"));
    window.history.back = jest.fn();
    act(() => result.current.close());
    expect(result.current.view).toBeNull();
    expect(window.location.search).toBe("");
    act(() => result.current.close());
    expect(window.history.back).toHaveBeenCalledTimes(1);
    act(() => result.current.open("open", "applet:1"));
    expect(result.current.itemId).toBe("applet:1");
});

test.each([
    { conciergeHomeView: true },
    { conciergeDialog: { owner: "old", param: "homeView", pathname: "/home" } },
])("stale dialog history cannot send Close away from Home", (state) => {
    installHomeHistory(
        "http://localhost/home?homeView=add&filter=mine#apps",
        state,
    );
    const { result } = renderHook(() => useHomeViewNavigation());
    act(() => result.current.close());
    expect(result.current.view).toBeNull();
    expect(window.location.href).toBe("http://localhost/home?filter=mine#apps");
    expect(window.history.back).not.toHaveBeenCalled();
});

test("restoring a dialog after a page remount closes in place", () => {
    installHomeHistory();
    const { result: first, unmount } = renderHook(() =>
        useHomeViewNavigation(),
    );
    act(() => first.current.open("add"));
    unmount();
    const { result: restored } = renderHook(() => useHomeViewNavigation());
    expect(restored.current.view).toBe("add");
    act(() => restored.current.close());
    expect(restored.current.view).toBeNull();
    expect(window.history.back).not.toHaveBeenCalled();
});

test("delayed browser Back does not hold the dialog open or traverse twice", () => {
    installHomeHistory();
    const { result } = renderHook(() => useHomeViewNavigation());
    act(() => result.current.open("open", "applet:1"));
    const traverse = window.history.back;
    window.history.back = jest.fn();
    act(() => {
        result.current.close();
        result.current.close();
    });
    expect(result.current.view).toBeNull();
    expect(window.history.back).toHaveBeenCalledTimes(1);
    act(() => traverse());
    expect(result.current.view).toBeNull();
    expect(window.location.pathname).toBe("/home");
});
