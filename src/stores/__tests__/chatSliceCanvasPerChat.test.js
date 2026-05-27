import chatReducer, {
    openCanvas,
    closeCanvas,
    setCanvasVisibility,
    setActiveCanvasChat,
    promoteCanvasChatId,
    clearCanvasForChat,
    restoreCanvasState,
} from "../chatSlice";

function emptyChatState() {
    // Only the canvas-related fields matter for these tests; the other
    // chatSlice fields (messages, chatBox) come from the reducer's initial
    // state which we get for free by passing undefined.
    return chatReducer(undefined, { type: "@@INIT" });
}

describe("chatSlice — per-chat canvas state", () => {
    test("setActiveCanvasChat seeds an empty bucket and remembers it across switches", () => {
        let state = emptyChatState();

        state = chatReducer(state, setActiveCanvasChat("chat-A"));
        state = chatReducer(
            state,
            openCanvas({ type: "html", title: "A.html", filename: "A.html" }),
        );

        expect(state.canvasContent?.title).toBe("A.html");
        expect(state.canvasTabs).toHaveLength(1);
        expect(state.canvasByChatId["chat-A"].canvasContent?.title).toBe(
            "A.html",
        );

        // Switch to chat B — top-level resets, A's bucket is preserved
        state = chatReducer(state, setActiveCanvasChat("chat-B"));
        expect(state.canvasContent).toBeNull();
        expect(state.canvasTabs).toHaveLength(0);
        expect(state.canvasByChatId["chat-A"].canvasContent?.title).toBe(
            "A.html",
        );

        state = chatReducer(
            state,
            openCanvas({ type: "html", title: "B.html", filename: "B.html" }),
        );
        expect(state.canvasContent?.title).toBe("B.html");

        // Switching back surfaces A's canvas again
        state = chatReducer(state, setActiveCanvasChat("chat-A"));
        expect(state.canvasContent?.title).toBe("A.html");
        expect(state.canvasTabs).toHaveLength(1);
        expect(state.canvasByChatId["chat-B"].canvasContent?.title).toBe(
            "B.html",
        );
    });

    test("openCanvas before activeChatId resolves parks the bucket under __pending__", () => {
        let state = emptyChatState();
        state = chatReducer(
            state,
            openCanvas({
                type: "html",
                title: "deeplink",
                filename: "deeplink.html",
            }),
        );

        expect(state.activeCanvasChatId).toBeNull();
        expect(state.canvasByChatId.__pending__.canvasContent?.title).toBe(
            "deeplink",
        );
    });

    test("setActiveCanvasChat adopts the __pending__ bucket the first time a chat activates", () => {
        let state = emptyChatState();
        state = chatReducer(
            state,
            openCanvas({
                type: "html",
                title: "deeplink",
                filename: "deeplink.html",
            }),
        );
        state = chatReducer(state, setActiveCanvasChat("chat-X"));

        expect(state.canvasContent?.title).toBe("deeplink");
        expect(state.canvasByChatId["chat-X"].canvasContent?.title).toBe(
            "deeplink",
        );
        expect(state.canvasByChatId.__pending__).toBeUndefined();
    });

    test("setActiveCanvasChat prefers __pending__ over an existing populated bucket", () => {
        // The applet-launch flow writes to __pending__ and then activates a
        // chat that may already have a stale bucket in memory (from a prior
        // open/close cycle on the same chat). The fresh __pending__ intent
        // must win — otherwise switching applets would silently keep the old
        // canvas open.
        let state = emptyChatState();

        // 1. Pre-existing stale bucket for chat-X (e.g. user previously had
        //    a canvas open here, closed it, then navigated away).
        state = chatReducer(state, setActiveCanvasChat("chat-X"));
        state = chatReducer(
            state,
            openCanvas({
                type: "html",
                title: "Stale",
                filename: "stale.html",
            }),
        );
        state = chatReducer(state, closeCanvas());
        expect(state.canvasByChatId["chat-X"]).toBeDefined();

        // 2. User clicks a new applet — clears active and writes to __pending__.
        state = chatReducer(state, setActiveCanvasChat(null));
        state = chatReducer(
            state,
            openCanvas({
                type: "html",
                title: "Fresh Applet",
                filename: "applet.html",
            }),
        );
        expect(state.canvasByChatId.__pending__.canvasContent?.title).toBe(
            "Fresh Applet",
        );

        // 3. Chat reactivates chat-X — __pending__ should win over the stale
        //    bucket that already exists for that chatId.
        state = chatReducer(state, setActiveCanvasChat("chat-X"));
        expect(state.canvasContent?.title).toBe("Fresh Applet");
        expect(state.canvasTabs).toHaveLength(1);
        expect(state.canvasVisible).toBe(true);
        expect(state.canvasByChatId.__pending__).toBeUndefined();
        expect(state.canvasByChatId["chat-X"].canvasContent?.title).toBe(
            "Fresh Applet",
        );
    });

    test("restoreCanvasState skips the transient 'new' bucket", () => {
        // /chat/new is a route, not a chat — its persisted state from prior
        // sessions is always stale and would clobber a freshly-launched
        // applet's canvas if rehydrated.
        let state = emptyChatState();
        state = chatReducer(
            state,
            restoreCanvasState({
                byChatId: {
                    new: {
                        canvasContent: { type: "html", title: "Stale New" },
                        canvasTabs: [],
                        activeTabId: null,
                        canvasVisible: true,
                    },
                    "chat-A": {
                        canvasContent: { type: "html", title: "Persisted A" },
                        canvasTabs: [],
                        activeTabId: null,
                        canvasVisible: true,
                    },
                },
            }),
        );
        expect(state.canvasByChatId.new).toBeUndefined();
        expect(state.canvasByChatId["chat-A"].canvasContent?.title).toBe(
            "Persisted A",
        );
    });

    test("setActiveCanvasChat does not reuse a stale transient new bucket", () => {
        let state = {
            ...emptyChatState(),
            canvasByChatId: {
                new: {
                    canvasContent: { type: "html", title: "Stale New" },
                    canvasTabs: [
                        {
                            id: "stale",
                            content: { type: "html", title: "Stale New" },
                            title: "Stale New",
                        },
                    ],
                    activeTabId: "stale",
                    canvasVisible: true,
                },
            },
        };

        state = chatReducer(state, setActiveCanvasChat("new"));

        expect(state.canvasByChatId.new).toBeUndefined();
        expect(state.canvasContent).toBeNull();
        expect(state.canvasTabs).toHaveLength(0);
        expect(state.activeTabId).toBeNull();
    });

    test("promoteCanvasChatId migrates the bucket from NEW_CHAT_ID to a real id", () => {
        let state = emptyChatState();
        state = chatReducer(state, setActiveCanvasChat("new"));
        state = chatReducer(
            state,
            openCanvas({ type: "html", title: "X", filename: "x.html" }),
        );
        expect(state.canvasByChatId.new.canvasContent?.title).toBe("X");

        state = chatReducer(
            state,
            promoteCanvasChatId({ fromChatId: "new", toChatId: "real-123" }),
        );

        expect(state.canvasByChatId.new).toBeUndefined();
        expect(state.canvasByChatId["real-123"].canvasContent?.title).toBe("X");
        expect(state.activeCanvasChatId).toBe("real-123");
        // Top-level still reflects the same canvas — the user shouldn't see a flash
        expect(state.canvasContent?.title).toBe("X");
    });

    test("clearCanvasForChat drops the bucket and resets top-level if it was active", () => {
        let state = emptyChatState();
        state = chatReducer(state, setActiveCanvasChat("new"));
        state = chatReducer(
            state,
            openCanvas({ type: "html", title: "X", filename: "x.html" }),
        );

        state = chatReducer(state, clearCanvasForChat("new"));

        expect(state.canvasByChatId.new).toBeUndefined();
        expect(state.canvasContent).toBeNull();
        expect(state.canvasTabs).toHaveLength(0);
    });

    test("restoreCanvasState hydrates byChatId snapshot and refreshes top-level for active chat", () => {
        let state = emptyChatState();
        state = chatReducer(state, setActiveCanvasChat("chat-A"));

        const snapshot = {
            byChatId: {
                "chat-A": {
                    canvasContent: { type: "html", title: "Persisted A" },
                    canvasTabs: [
                        {
                            id: "t1",
                            content: { type: "html", title: "Persisted A" },
                            title: "Persisted A",
                        },
                    ],
                    activeTabId: "t1",
                    canvasVisible: true,
                },
                "chat-B": {
                    canvasContent: { type: "html", title: "Persisted B" },
                    canvasTabs: [],
                    activeTabId: null,
                    canvasVisible: false,
                },
            },
        };

        state = chatReducer(state, restoreCanvasState(snapshot));

        expect(state.canvasContent?.title).toBe("Persisted A");
        expect(state.activeTabId).toBe("t1");
        expect(state.canvasByChatId["chat-B"].canvasContent?.title).toBe(
            "Persisted B",
        );

        state = chatReducer(state, setActiveCanvasChat("chat-B"));
        expect(state.canvasContent?.title).toBe("Persisted B");
        expect(state.canvasVisible).toBe(false);
    });

    test("restoreCanvasState accepts the legacy single-blob shape", () => {
        let state = emptyChatState();
        const legacy = {
            canvasContent: { type: "html", title: "Legacy" },
            canvasTabs: [
                {
                    id: "t1",
                    content: { type: "html", title: "Legacy" },
                    title: "Legacy",
                },
            ],
            activeTabId: "t1",
            canvasVisible: true,
        };

        state = chatReducer(state, restoreCanvasState(legacy));
        expect(state.canvasByChatId.__pending__.canvasContent?.title).toBe(
            "Legacy",
        );

        // Activating a chat for the first time adopts the legacy blob
        state = chatReducer(state, setActiveCanvasChat("chat-Z"));
        expect(state.canvasContent?.title).toBe("Legacy");
        expect(state.canvasByChatId["chat-Z"].canvasContent?.title).toBe(
            "Legacy",
        );
        expect(state.canvasByChatId.__pending__).toBeUndefined();
    });

    test("setCanvasVisibility writes through to the active bucket", () => {
        let state = emptyChatState();
        state = chatReducer(state, setActiveCanvasChat("chat-A"));
        state = chatReducer(
            state,
            openCanvas({ type: "html", title: "A", filename: "a.html" }),
        );
        state = chatReducer(state, setCanvasVisibility(false));

        expect(state.canvasVisible).toBe(false);
        expect(state.canvasByChatId["chat-A"].canvasVisible).toBe(false);

        // Switch away and back; visibility persists per chat
        state = chatReducer(state, setActiveCanvasChat("chat-B"));
        expect(state.canvasVisible).toBe(true); // default for fresh chat
        state = chatReducer(state, setActiveCanvasChat("chat-A"));
        expect(state.canvasVisible).toBe(false);
    });

    test("closeCanvas only clears the active chat's bucket, not others", () => {
        let state = emptyChatState();
        state = chatReducer(state, setActiveCanvasChat("chat-A"));
        state = chatReducer(
            state,
            openCanvas({ type: "html", title: "A", filename: "a.html" }),
        );
        state = chatReducer(state, setActiveCanvasChat("chat-B"));
        state = chatReducer(
            state,
            openCanvas({ type: "html", title: "B", filename: "b.html" }),
        );

        state = chatReducer(state, closeCanvas());

        expect(state.canvasContent).toBeNull();
        expect(state.canvasTabs).toHaveLength(0);
        expect(state.canvasByChatId["chat-B"].canvasContent).toBeNull();
        // Chat A is untouched
        expect(state.canvasByChatId["chat-A"].canvasContent?.title).toBe("A");
    });
});
