import chatReducer, {
    openCanvas,
    setActiveCanvasChat,
    updateCanvasTab,
} from "../chatSlice";

describe("chatSlice canvas state", () => {
    test("parks canvas opened before a chat exists and adopts it for the new chat", () => {
        let state = chatReducer(
            undefined,
            openCanvas({
                type: "html",
                title: "Generated Applet",
                htmlContent: "<html></html>",
                appletId: "applet-1",
            }),
        );

        expect(state.canvasByChatId.__pending__.canvasContent.title).toBe(
            "Generated Applet",
        );

        state = chatReducer(state, setActiveCanvasChat("chat-1"));

        expect(state.activeCanvasChatId).toBe("chat-1");
        expect(state.canvasByChatId.__pending__).toBeUndefined();
        expect(state.canvasByChatId["chat-1"].canvasContent.appletId).toBe(
            "applet-1",
        );
        expect(state.canvasContent.appletId).toBe("applet-1");
    });

    test("updates active canvas tab metadata", () => {
        let state = chatReducer(
            undefined,
            openCanvas({
                tabId: "tab-1",
                type: "html",
                title: "Generating applet...",
                htmlStatus: "generating",
            }),
        );

        state = chatReducer(
            state,
            updateCanvasTab({
                tabId: "tab-1",
                content: {
                    title: "weather.html",
                    filename: "weather.html",
                    htmlStatus: null,
                    appletId: "applet-2",
                    url: "https://example.com/weather.html",
                },
            }),
        );

        expect(state.canvasTabs[0].title).toBe("weather.html");
        expect(state.canvasContent.appletId).toBe("applet-2");
        expect(state.canvasContent.url).toBe(
            "https://example.com/weather.html",
        );
    });
});
