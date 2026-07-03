/**
 * @jest-environment node
 */

import { openCanvasAppletInChat } from "@/src/utils/openCanvasApplet";

jest.mock("@/src/stores/chatSlice", () => ({
    openCanvas: jest.fn((payload) => ({ type: "openCanvas", payload })),
    setActiveCanvasChat: jest.fn((chatId) => ({
        type: "setActiveCanvasChat",
        payload: chatId,
    })),
}));

describe("openCanvasAppletInChat", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it("opens a fetched applet in a new chat", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet-1",
                name: "Timer",
                html: "<html>timer</html>",
            }),
        });

        const dispatch = jest.fn();
        const router = { push: jest.fn() };
        const addChat = {
            mutateAsync: jest.fn().mockResolvedValue({ _id: "chat-1" }),
        };

        await openCanvasAppletInChat({
            appletId: "applet-1",
            addChat,
            dispatch,
            router,
        });

        expect(addChat.mutateAsync).toHaveBeenCalledWith({
            messages: [],
            title: "Timer",
        });
        expect(dispatch).toHaveBeenCalledTimes(2);
        expect(router.push).toHaveBeenCalledWith("/chat/chat-1");
    });

    it("throws when the applet cannot be loaded", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
        });

        await expect(
            openCanvasAppletInChat({
                appletId: "missing-applet",
                addChat: { mutateAsync: jest.fn() },
                dispatch: jest.fn(),
                router: { push: jest.fn() },
            }),
        ).rejects.toThrow("Failed to fetch applet: 404");
    });
});
