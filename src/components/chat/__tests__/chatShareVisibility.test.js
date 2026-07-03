import { resolveStableChatOwnerState } from "../chatShareVisibility";

describe("resolveStableChatOwnerState", () => {
    it("keeps owner visibility when a current-chat cache update omits isOwner", () => {
        const confirmed = resolveStableChatOwnerState({
            chat: { _id: "chat-1", isOwner: true },
        });

        expect(confirmed).toEqual({
            confirmedOwnerChatId: "chat-1",
            isChatOwner: true,
        });

        expect(
            resolveStableChatOwnerState({
                chat: { _id: "chat-1", messages: [] },
                confirmedOwnerChatId: confirmed.confirmedOwnerChatId,
            }).isChatOwner,
        ).toBe(true);
    });

    it("does not leak owner visibility to other chats or read-only shared views", () => {
        expect(
            resolveStableChatOwnerState({
                chat: { _id: "chat-2", messages: [] },
                confirmedOwnerChatId: "chat-1",
            }).isChatOwner,
        ).toBe(false);

        expect(
            resolveStableChatOwnerState({
                chat: { _id: "chat-1", messages: [] },
                readOnly: true,
                confirmedOwnerChatId: "chat-1",
            }).isChatOwner,
        ).toBe(false);

        expect(
            resolveStableChatOwnerState({
                chat: { _id: "chat-1", isOwner: false },
                confirmedOwnerChatId: "chat-1",
            }).isChatOwner,
        ).toBe(false);
    });
});
