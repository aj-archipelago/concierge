"use client";

import { createSlice, createAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";

export const toggleArticles = createAction("chat/toggleArticles");

const getSafeLocalStorage = () => {
    if (typeof localStorage === "undefined") return null;
    try {
        if (!localStorage || typeof localStorage.getItem !== "function") {
            return null;
        }
        return localStorage;
    } catch (error) {
        return null;
    }
};

const getInitialMessages = () => {
    const storage = getSafeLocalStorage();
    if (!storage) return [];
    const storedMessages = storage.getItem("messages");
    return storedMessages ? JSON.parse(storedMessages) : [];
};

const getInitialChatBox = () => {
    const storage = getSafeLocalStorage();
    if (!storage) return null;
    const storedChatBox = storage.getItem("chatbox");
    return storedChatBox
        ? JSON.parse(storedChatBox)
        : { width: 300, position: "closed" };
};

const getInitialCanvasWidth = () => {
    const storage = getSafeLocalStorage();
    if (!storage) return null;
    const storedWidth = storage.getItem("canvasWidth");
    return storedWidth ? parseInt(storedWidth, 10) : null;
};

function snapshotActiveCanvas(state) {
    return {
        canvasContent: state.canvasContent,
        canvasTabs: state.canvasTabs,
        activeTabId: state.activeTabId,
        canvasVisible: state.canvasVisible,
    };
}

const EMPTY_CANVAS = Object.freeze({
    canvasContent: null,
    canvasTabs: [],
    activeTabId: null,
    canvasVisible: true,
});

function syncActiveCanvasToBucket(state) {
    const chatId = state.activeCanvasChatId || "__pending__";
    state.canvasByChatId = state.canvasByChatId || {};
    state.canvasByChatId[chatId] = snapshotActiveCanvas(state);
}

function applyCanvasSnapshot(state, snapshot) {
    const safe = snapshot || EMPTY_CANVAS;
    state.canvasContent = safe.canvasContent ?? null;
    state.canvasTabs = Array.isArray(safe.canvasTabs) ? safe.canvasTabs : [];
    state.activeTabId = safe.activeTabId ?? null;
    state.canvasVisible =
        typeof safe.canvasVisible === "boolean" ? safe.canvasVisible : true;
}

function findTabByContent(tabs, payload) {
    if (!tabs.length || !payload || payload.type === "empty") return null;
    return (
        tabs.find(
            (tab) =>
                (payload.appletId &&
                    tab.content?.appletId === payload.appletId) ||
                (payload.fileHash &&
                    tab.content?.fileHash === payload.fileHash) ||
                (!payload.appletId &&
                    !payload.fileHash &&
                    payload.url &&
                    tab.content?.url === payload.url),
        ) || null
    );
}

export const chatSlice = createSlice({
    name: "chat",
    initialState: {
        messages: getInitialMessages(),
        chatBox: getInitialChatBox(),
        unreadCount: 0,
        includeArticles: false,
        canvasContent: null,
        canvasTabs: [],
        activeTabId: null,
        canvasVisible: true,
        canvasByChatId: {},
        activeCanvasChatId: null,
        canvasWidth: getInitialCanvasWidth(),
        fileBrowserRefreshKey: 0,
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
        setMessages: (state, action) => {
            state.messages = action.payload;

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
                        sentTime: new Date().toISOString(),
                        direction: "incoming",
                        position: "single",
                        sender: "assistant",
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
        openCanvas: (state, action) => {
            const payload = action.payload;
            let tabId = payload.tabId;

            if (!tabId) {
                const duplicate = findTabByContent(state.canvasTabs, payload);
                tabId = duplicate?.id || uuidv4();
            }

            if (state.canvasTabs.length === 0) {
                state.canvasTabs = [
                    {
                        id: tabId,
                        content: payload,
                        title: payload.title || payload.filename || "Canvas",
                    },
                ];
                state.activeTabId = tabId;
            } else {
                const existingTabIndex = state.canvasTabs.findIndex(
                    (tab) => tab.id === tabId,
                );
                if (existingTabIndex >= 0) {
                    state.canvasTabs[existingTabIndex].content = payload;
                    state.canvasTabs[existingTabIndex].title =
                        payload.title ||
                        payload.filename ||
                        state.canvasTabs[existingTabIndex].title;
                    state.activeTabId = tabId;
                } else {
                    state.canvasTabs.push({
                        id: tabId,
                        content: payload,
                        title: payload.title || payload.filename || "Canvas",
                    });
                    state.activeTabId = tabId;
                }
            }

            state.canvasContent = payload;
            state.canvasVisible = true;
            syncActiveCanvasToBucket(state);
        },
        updateCanvasTab: (state, action) => {
            const { tabId, content } = action.payload;
            const tab = state.canvasTabs.find((t) => t.id === tabId);
            if (!tab) return;

            const metadata = Object.fromEntries(
                Object.entries({
                    type: content.type,
                    title: content.title,
                    filename: content.filename,
                    fileHash: content.fileHash,
                    blobPath: content.blobPath,
                    url: content.url,
                    htmlContent: content.htmlContent,
                    workspacePath: content.workspacePath,
                    htmlStatus: content.htmlStatus,
                    htmlError: content.htmlError,
                    appletId: content.appletId,
                }).filter(([, value]) => value !== undefined),
            );

            tab.content = { ...tab.content, ...metadata };
            tab.title = content.title || content.filename || tab.title;

            if (state.activeTabId === tabId) {
                state.canvasContent = {
                    ...state.canvasContent,
                    ...metadata,
                };
            }
            syncActiveCanvasToBucket(state);
        },
        setCanvasVisibility: (state, action) => {
            state.canvasVisible = action.payload;
            syncActiveCanvasToBucket(state);
        },
        setCanvasWidth: (state, action) => {
            const width = action.payload;
            state.canvasWidth = width;

            const storage = getSafeLocalStorage();
            if (!storage) return;
            try {
                if (width === null) {
                    storage.removeItem("canvasWidth");
                } else {
                    storage.setItem("canvasWidth", String(width));
                }
            } catch (error) {
                console.error(
                    "Error storing canvas width in localStorage:",
                    error,
                );
            }
        },
        incrementFileBrowserRefresh: (state) => {
            state.fileBrowserRefreshKey =
                (state.fileBrowserRefreshKey || 0) + 1;
        },
        setActiveCanvasChat: (state, action) => {
            const nextChatId = action.payload || null;
            if (nextChatId === state.activeCanvasChatId) return;

            state.canvasByChatId = state.canvasByChatId || {};
            const prevChatId = state.activeCanvasChatId;
            if (prevChatId) {
                state.canvasByChatId[prevChatId] = snapshotActiveCanvas(state);
            }

            state.activeCanvasChatId = nextChatId;

            if (!nextChatId) {
                applyCanvasSnapshot(state, null);
                return;
            }

            const pending = state.canvasByChatId.__pending__;
            const pendingHasContent =
                pending &&
                (pending.canvasContent ||
                    (Array.isArray(pending.canvasTabs) &&
                        pending.canvasTabs.length > 0));

            if (pendingHasContent) {
                state.canvasByChatId[nextChatId] = pending;
                delete state.canvasByChatId.__pending__;
                applyCanvasSnapshot(state, pending);
                return;
            }

            if (nextChatId === "new") {
                delete state.canvasByChatId[nextChatId];
                applyCanvasSnapshot(state, null);
                return;
            }

            applyCanvasSnapshot(state, state.canvasByChatId[nextChatId]);
        },
    },
    extraReducers: (builder) => {
        builder.addCase(toggleArticles, (state) => {
            state.includeArticles = !state.includeArticles;
        });
    },
});

// Action creators are generated for each case reducer function
export const {
    // addMessage,
    // setMessages,
    // clearChat,
    // firstRunMessage,
    setChatBoxPosition,
    includeArticles,
    openCanvas,
    updateCanvasTab,
    setCanvasVisibility,
    setCanvasWidth,
    incrementFileBrowserRefresh,
    setActiveCanvasChat,
} = chatSlice.actions;

export default chatSlice.reducer;
