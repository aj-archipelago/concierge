"use client";

import { createSlice, createAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";

export const toggleAJArticles = createAction("chat/toggleAJArticles");

const getInitialMessages = () => {
    if (typeof localStorage !== "undefined") {
        const storedMessages = localStorage.getItem("messages");
        return storedMessages ? JSON.parse(storedMessages) : [];
    } else {
        return [];
    }
};

const getInitialChatBox = () => {
    if (typeof localStorage !== "undefined") {
        const storedChatBox = localStorage.getItem("chatbox");
        return storedChatBox
            ? JSON.parse(storedChatBox)
            : { width: 300, position: "closed" };
    } else {
        return null;
    }
};

export const chatSlice = createSlice({
    name: "chat",
    initialState: {
        messages: getInitialMessages(),
        chatBox: getInitialChatBox(),
        unreadCount: 0,
        includeAJArticles: false,
    },
    reducers: {
        addMessage: (state, action) => {
            const message = action.payload;
            if (!message.id) message.id = uuidv4();
            state.messages.push(message);

            if (typeof localStorage !== "undefined") {
                try {
                    localStorage.setItem(
                        "messages",
                        JSON.stringify(state.messages),
                    );
                } catch (error) {
                    console.error(
                        "Error storing messages in localStorage:",
                        error,
                    );
                }
            }
        },
        clearChat: (state) => {
            state.messages = [];
            state.lastContext = "";

            if (typeof localStorage !== "undefined") {
                try {
                    localStorage.removeItem("messages");
                } catch (error) {
                    console.error(
                        "Error clearing messages from localStorage:",
                        error,
                    );
                }
            }
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
    firstRunMessage,
    setChatBoxPosition,
    includeAJArticles,
} = chatSlice.actions;

export default chatSlice.reducer;
