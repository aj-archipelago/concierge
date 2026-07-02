import { focusChatInput } from "../stores/chatSlice";

export const requestChatInputFocus = (dispatch) => {
    if (typeof window !== "undefined") {
        window.__chatFocusRequest = Date.now();
    }

    if (typeof dispatch === "function") {
        dispatch(focusChatInput());
    }
};

export const startNewChat = ({ router, dispatch, createChat }) => {
    requestChatInputFocus(dispatch);

    return createChat().then((chat) => {
        const chatId = String(chat?._id || "");
        if (chatId) {
            router.push(`/chat/${chatId}`);
        }
        return chatId;
    });
};
