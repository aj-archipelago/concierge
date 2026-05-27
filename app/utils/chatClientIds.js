export const NEW_CHAT_ID = "new";

export const isClientOnlyChatId = (chatId) =>
    String(chatId || "") === NEW_CHAT_ID;
