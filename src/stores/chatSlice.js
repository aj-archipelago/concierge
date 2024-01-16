"use client";

import { createSlice, createAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";

export const toggleAJArticles = createAction("chat/toggleAJArticles");

function getContextId() {
    if (typeof localStorage === "undefined") return null;

    let contextId = localStorage.getItem("chatContextId");
    if (!contextId || contextId === "null" || contextId === "undefined") {
        contextId = uuidv4();
        localStorage.setItem("chatContextId", contextId);
    }
    return contextId;
}

export const chatSlice = createSlice({
    name: "chat",
    initialState: {
        messages: [],
        contextId: getContextId(),
        chatBox:
            typeof localStorage !== "undefined"
                ? localStorage.getItem("chatbox")
                    ? JSON.parse(localStorage.getItem("chatbox"))
                    : { width: 300, position: "closed" }
                : null,
        unreadCount: 0,
        includeAJArticles: false,
    },
    reducers: {
        addMessage: (state, action) => {
            const message = action.payload;
            if (!message.id) message.id = uuidv4();
            state.messages.push(message);

            if (state.chatBox.position === "closed") {
                chatSlice.caseReducers.setChatBoxPosition(state, {
                    payload: {
                        position: "opened",
                    },
                });
            }
        },
        setContextId: (state, action) => {
            const contextId = action.payload || uuidv4();
            state.contextId = contextId;
            localStorage.setItem("chatContextId", contextId);
        },
        clearChat: (state, action) => {
            state.messages = [];
            state.lastContext = "";
        },
        firstRunMessage: (state, action) => {
            const { id, message } = action.payload;
            const messageAlreadyShown = localStorage.getItem("first-run")
                ? JSON.parse(localStorage.getItem("first-run"))
                : {};

            if (!messageAlreadyShown[id]) {
                chatSlice.caseReducers.addMessage(state, {
                    payload: {
                        id: uuidv4(),
                        payload: message,
                        sentTime: "just now",
                        direction: "incoming",
                        position: "single",
                        sender: "labeeb",
                    },
                });
                messageAlreadyShown[id] = true;
                localStorage.setItem(
                    "first-run",
                    JSON.stringify(messageAlreadyShown),
                );
            }
        },
        setChatBoxPosition: (state, action) => {
            const attrs = action.payload;
            state.chatBox = state.chatBox || {};

            if (attrs.position) {
                state.chatBox.position = attrs.position;
                if (attrs.position !== "closed") {
                    state.chatBox.lastOpenPosition = attrs.position;
                }
            }

            if (attrs.width) {
                state.chatBox.width = attrs.width < 0 ? 300 : attrs.width;
            }

            localStorage.setItem("chatbox", JSON.stringify(state.chatBox));

            if (attrs.position === "opened") {
                state.unreadCount = 0;
            }
        },
    },
    extraReducers: {
        [toggleAJArticles]: (state) => {
            state.includeAJArticles = !state.includeAJArticles;
        },
    },
});

// Action creators are generated for each case reducer function
export const {
    addMessage,
    clearChat,
    setContextId,
    firstRunMessage,
    setChatBoxPosition,
    includeAJArticles,
} = chatSlice.actions;

export default chatSlice.reducer;
