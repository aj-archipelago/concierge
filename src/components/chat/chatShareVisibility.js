export function resolveStableChatOwnerState({
    chat,
    readOnly = false,
    publicChatOwner = null,
    confirmedOwnerChatId = null,
}) {
    const chatId = chat?._id ? String(chat._id) : null;
    const isExplicitOwner = chat?.isOwner === true;
    const isExplicitNonOwner =
        chat?.isOwner === false || readOnly || Boolean(publicChatOwner);

    const nextConfirmedOwnerChatId =
        isExplicitOwner && chatId ? chatId : confirmedOwnerChatId;

    return {
        confirmedOwnerChatId: nextConfirmedOwnerChatId,
        isChatOwner:
            isExplicitOwner ||
            Boolean(
                chatId &&
                    nextConfirmedOwnerChatId === chatId &&
                    !isExplicitNonOwner,
            ),
    };
}
