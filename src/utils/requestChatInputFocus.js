import { focusChatInput } from "../stores/chatSlice";

export const NEW_CHAT_REQUEST_EVENT = "chat:new-chat-requested";

export const requestChatInputFocus = (dispatch) => {
    if (typeof window !== "undefined") {
        window.__chatFocusRequest = Date.now();
    }

    if (typeof dispatch === "function") {
        dispatch(focusChatInput());
    }
};

export const startNewChat = ({
    pathname,
    router,
    dispatch,
    preserveCanvas = false,
}) => {
    requestChatInputFocus(dispatch);

    // Always signal a new chat reset (clears promoted state & stale cache).
    // preserveCanvas=true keeps any canvas just opened by the caller (e.g.
    // launching an applet) from being wiped by Chat's reset handler.
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent(NEW_CHAT_REQUEST_EVENT, {
                detail: { preserveCanvas },
            }),
        );
    }

    const currentPathname =
        typeof window !== "undefined" &&
        typeof window.location?.pathname === "string" &&
        window.location.pathname.startsWith("/chat")
            ? window.location.pathname
            : pathname;

    if (currentPathname !== "/chat/new") {
        router.push("/chat/new");
    }
};
