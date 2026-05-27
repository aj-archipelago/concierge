"use client";

import { createSlice, createAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";

export const toggleArticles = createAction("chat/toggleArticles");
export const focusChatInput = createAction("chat/focusChatInput");

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
    return storedWidth ? parseInt(storedWidth, 10) : null; // null means use default (50%)
};

// Strip transient/heavy fields before persisting canvas tabs into UserState.
// The workspace file is the source of truth for both articles and applets, so
// we only persist identity (workspacePath / blobPath / fileHash / title) and
// re-load the body from the file on mount.
export function stripCanvasPersistContent(content) {
    if (!content) return content;
    const {
        htmlContent: _htmlContent,
        content: _bodyContent,
        headline: _headline,
        subhead: _subhead,
        featuredImageUrl: _featuredImageUrl,
        htmlStatus: _htmlStatus,
        htmlError: _htmlError,
        ...rest
    } = content;
    return rest;
}

// Snapshot of per-chat canvas state. Top-level canvasContent/canvasTabs/
// activeTabId/canvasVisible always mirror the bucket for activeCanvasChatId
// so existing selectors keep working unchanged.
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

// After mutating top-level canvas fields, mirror the new state into the
// active chat's bucket. Reducers that change canvas state must call this
// before returning so navigating away/back preserves what the user saw.
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

// Find an existing tab whose content matches the given payload by identity keys.
// This prevents the same file/applet from being opened in multiple tabs.
function findTabByContent(tabs, payload) {
    if (!tabs.length) return null;
    // Skip identity matching for "empty" tabs — those are intentionally blank
    if (!payload || payload.type === "empty") return null;
    return (
        tabs.find(
            (tab) =>
                (payload.appletId &&
                    tab.content?.appletId === payload.appletId) ||
                (payload.fileHash &&
                    tab.content?.fileHash === payload.fileHash) ||
                // URL-only content (e.g. html preview with no hash/applet)
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
        // Top-level canvas fields always reflect the active chat's bucket
        // (canvasByChatId[activeCanvasChatId]). This keeps every selector
        // signature unchanged while making canvas state per-chat.
        canvasContent: null, // { type: 'story'|'image'|..., title: string, ...content-specific fields }
        canvasTabs: [], // Array of tab objects: { id: string, content: {...}, title: string }
        activeTabId: null, // ID of the currently active tab
        canvasVisible: true, // Whether the canvas is visible (can be hidden even if content exists)
        // Per-chat canvas storage: { [chatId]: { canvasContent, canvasTabs, activeTabId, canvasVisible } }.
        // The active bucket is mirrored to the top-level fields above on
        // setActiveCanvasChat. Buckets without a chatId (deep links opened
        // before activeChatId resolves) live under "__pending__".
        canvasByChatId: {},
        activeCanvasChatId: null,
        canvasWidth: getInitialCanvasWidth(), // Canvas width in pixels (null = default 50%) — global user pref
        fileBrowserRefreshKey: 0, // Incremented to trigger folder browser refresh — workspace browser is shared across chats
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

            // Deduplicate: if no explicit tabId, find existing tab with same content identity
            if (!tabId) {
                const dup = findTabByContent(state.canvasTabs, payload);
                tabId = dup?.id || uuidv4();
            }

            // If tabs array is empty, initialize with first tab
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
                // Check if tab already exists
                const existingTabIndex = state.canvasTabs.findIndex(
                    (tab) => tab.id === tabId,
                );
                if (existingTabIndex >= 0) {
                    // Update existing tab
                    state.canvasTabs[existingTabIndex].content = payload;
                    state.canvasTabs[existingTabIndex].title =
                        payload.title ||
                        payload.filename ||
                        state.canvasTabs[existingTabIndex].title;
                    state.activeTabId = tabId;
                } else {
                    // Create new tab
                    state.canvasTabs.push({
                        id: tabId,
                        content: payload,
                        title: payload.title || payload.filename || "Canvas",
                    });
                    state.activeTabId = tabId;
                }
            }

            // Keep canvasContent for backward compatibility
            state.canvasContent = payload;
            state.canvasVisible = true; // Show canvas when content is opened
            syncActiveCanvasToBucket(state);
        },
        addCanvasTab: (state, action) => {
            const payload = action.payload || {
                type: "empty",
                title: "Canvas",
            };

            // Deduplicate: if a tab with the same content already exists, just activate it
            const dup = findTabByContent(state.canvasTabs, payload);
            if (dup) {
                state.activeTabId = dup.id;
                state.canvasContent = dup.content;
                state.canvasVisible = true;
                syncActiveCanvasToBucket(state);
                return;
            }

            const tabId = uuidv4();
            const newTab = {
                id: tabId,
                content: payload,
                title: payload.title || payload.filename || "Canvas",
            };
            state.canvasTabs.push(newTab);
            state.activeTabId = tabId;
            state.canvasContent = newTab.content;
            state.canvasVisible = true;
            syncActiveCanvasToBucket(state);
        },
        closeCanvasTab: (state, action) => {
            const tabId = action.payload;
            const tabIndex = state.canvasTabs.findIndex(
                (tab) => tab.id === tabId,
            );

            if (tabIndex >= 0) {
                state.canvasTabs.splice(tabIndex, 1);

                // If we closed the active tab, switch to another one
                if (state.activeTabId === tabId) {
                    if (state.canvasTabs.length > 0) {
                        // Switch to the tab that was before this one, or the first tab
                        const newActiveIndex = Math.max(0, tabIndex - 1);
                        state.activeTabId = state.canvasTabs[newActiveIndex].id;
                        state.canvasContent =
                            state.canvasTabs[newActiveIndex].content;
                    } else {
                        // No tabs left
                        state.activeTabId = null;
                        state.canvasContent = null;
                    }
                }
                syncActiveCanvasToBucket(state);
            }
        },
        switchCanvasTab: (state, action) => {
            const tabId = action.payload;
            const tab = state.canvasTabs.find((t) => t.id === tabId);
            if (tab) {
                state.activeTabId = tabId;
                state.canvasContent = tab.content;
                syncActiveCanvasToBucket(state);
            }
        },
        updateCanvasTab: (state, action) => {
            const { tabId, content } = action.payload;
            const tab = state.canvasTabs.find((t) => t.id === tabId);
            if (tab) {
                // Only store minimal metadata in Redux, not full article content
                // Tab components maintain their own state via hooks
                const raw = {
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
                    canvasChrome: content.canvasChrome,
                    appletId: content.appletId,
                    appletVersionKey: content.appletVersionKey,
                    appletVersionCount: content.appletVersionCount,
                    appletActiveVersionIndex: content.appletActiveVersionIndex,
                    appletActiveVersionNumber:
                        content.appletActiveVersionNumber,
                    appletIsViewingDraft: content.appletIsViewingDraft,
                    workspaceContentVersion: content.workspaceContentVersion,
                };

                const metadata = Object.fromEntries(
                    Object.entries(raw).filter(([, v]) => v !== undefined),
                );

                tab.content = { ...tab.content, ...metadata };
                tab.title = content.title || content.filename || tab.title;

                // Update canvasContent for backward compatibility
                if (state.activeTabId === tabId) {
                    state.canvasContent = {
                        ...state.canvasContent,
                        ...metadata,
                    };
                }
                syncActiveCanvasToBucket(state);
            }
        },
        refreshActiveHtmlCanvas: (state, action) => {
            const { htmlContent } = action.payload;
            if (!state.activeTabId) return;
            const tab = state.canvasTabs.find(
                (t) => t.id === state.activeTabId,
            );
            if (!tab || tab.content?.type !== "html") return;
            tab.content = { ...tab.content, htmlContent, htmlStatus: "live" };
            state.canvasContent = {
                ...state.canvasContent,
                htmlContent,
                htmlStatus: "live",
            };
            syncActiveCanvasToBucket(state);
        },
        closeCanvas: (state) => {
            state.canvasContent = null;
            state.canvasTabs = [];
            state.activeTabId = null;
            // Note: canvasVisible is managed separately by callers via setCanvasVisibility
            syncActiveCanvasToBucket(state);
        },
        toggleCanvasVisibility: (state) => {
            state.canvasVisible = !state.canvasVisible;
            syncActiveCanvasToBucket(state);
        },
        setCanvasVisibility: (state, action) => {
            state.canvasVisible = action.payload;
            syncActiveCanvasToBucket(state);
        },
        setCanvasWidth: (state, action) => {
            const width = action.payload;
            state.canvasWidth = width;

            // Persist to localStorage
            if (typeof localStorage !== "undefined") {
                try {
                    if (width === null) {
                        localStorage.removeItem("canvasWidth");
                    } else {
                        localStorage.setItem("canvasWidth", String(width));
                    }
                } catch (error) {
                    console.error(
                        "Error storing canvas width in localStorage:",
                        error,
                    );
                }
            }
        },
        incrementFileBrowserRefresh: (state) => {
            state.fileBrowserRefreshKey =
                (state.fileBrowserRefreshKey || 0) + 1;
        },
        // Bulk-replace per-chat canvas storage from a persisted snapshot
        // (e.g. UserState). Used once on Chat mount to seed canvasByChatId.
        // The active bucket is then materialized via setActiveCanvasChat.
        //
        // Accepts two shapes:
        //   { byChatId: { [chatId]: { canvasContent, canvasTabs, ... } } }  (current)
        //   { canvasContent, canvasTabs, activeTabId, canvasVisible }       (legacy single-blob)
        // Legacy snapshots are treated as the bucket for "__pending__" so
        // they surface as soon as the chat resolves (and migrate on
        // setActiveCanvasChat).
        restoreCanvasState: (state, action) => {
            const snapshot = action.payload || {};
            state.canvasByChatId = state.canvasByChatId || {};

            if (snapshot.byChatId && typeof snapshot.byChatId === "object") {
                for (const [chatId, bucket] of Object.entries(
                    snapshot.byChatId,
                )) {
                    if (!bucket) continue;
                    // Never restore a "new" chat bucket. /chat/new is a
                    // transient route — its state from a prior session is
                    // always stale, and rehydrating it will clobber a
                    // freshly-opened canvas (e.g. an applet just launched
                    // from /applets) once setActiveCanvasChat("new") fires.
                    if (chatId === "new") continue;
                    state.canvasByChatId[chatId] = {
                        canvasContent: bucket.canvasContent ?? null,
                        canvasTabs: Array.isArray(bucket.canvasTabs)
                            ? bucket.canvasTabs
                            : [],
                        activeTabId: bucket.activeTabId ?? null,
                        canvasVisible:
                            typeof bucket.canvasVisible === "boolean"
                                ? bucket.canvasVisible
                                : true,
                    };
                }
            } else if (
                Array.isArray(snapshot.canvasTabs) ||
                snapshot.canvasContent
            ) {
                state.canvasByChatId.__pending__ = {
                    canvasContent: snapshot.canvasContent ?? null,
                    canvasTabs: Array.isArray(snapshot.canvasTabs)
                        ? snapshot.canvasTabs
                        : [],
                    activeTabId: snapshot.activeTabId ?? null,
                    canvasVisible:
                        typeof snapshot.canvasVisible === "boolean"
                            ? snapshot.canvasVisible
                            : true,
                };
            }

            // If a chat is already active, refresh top-level fields from the
            // newly-hydrated bucket so the user sees their persisted canvas.
            if (state.activeCanvasChatId) {
                applyCanvasSnapshot(
                    state,
                    state.canvasByChatId[state.activeCanvasChatId],
                );
            }
        },
        // Switch which chat the top-level canvas fields reflect. Saves the
        // current active bucket and loads the requested one. Pass null to
        // clear active (canvas fields reset to empty).
        setActiveCanvasChat: (state, action) => {
            const nextChatId = action.payload || null;
            if (nextChatId === state.activeCanvasChatId) return;

            state.canvasByChatId = state.canvasByChatId || {};
            const prevChatId = state.activeCanvasChatId;
            if (prevChatId) {
                state.canvasByChatId[prevChatId] = snapshotActiveCanvas(state);
            }

            state.activeCanvasChatId = nextChatId;

            if (nextChatId) {
                const pending = state.canvasByChatId.__pending__;
                const pendingHasContent =
                    pending &&
                    (pending.canvasContent ||
                        (Array.isArray(pending.canvasTabs) &&
                            pending.canvasTabs.length > 0));
                let bucket;
                if (pendingHasContent) {
                    // Pending represents an explicit just-opened canvas (e.g.
                    // launching an applet from /applets before the new chat
                    // resolved). Prefer it over any existing/persisted bucket
                    // for this chatId — otherwise restoreCanvasState rehydrating
                    // a stale empty bucket would clobber the user's intent.
                    bucket = pending;
                    state.canvasByChatId[nextChatId] = bucket;
                    delete state.canvasByChatId.__pending__;
                } else {
                    if (nextChatId === "new") {
                        // /chat/new is a transient compose route, not a real
                        // chat. Any bucket already keyed as "new" is stale
                        // unless a fresh __pending__ canvas was just adopted
                        // above (for applet-launch flows that preserve canvas).
                        delete state.canvasByChatId[nextChatId];
                        applyCanvasSnapshot(state, null);
                        return;
                    }
                    bucket = state.canvasByChatId[nextChatId];
                    if (!bucket && state.canvasByChatId.__pending__) {
                        bucket = state.canvasByChatId.__pending__;
                        state.canvasByChatId[nextChatId] = bucket;
                        delete state.canvasByChatId.__pending__;
                    }
                }
                applyCanvasSnapshot(state, bucket);
            } else {
                applyCanvasSnapshot(state, null);
            }
        },
        // Re-key a chat's canvas bucket. Used when a NEW_CHAT_ID is promoted
        // to a real persisted id so the user's in-flight canvas survives.
        promoteCanvasChatId: (state, action) => {
            const { fromChatId, toChatId } = action.payload || {};
            if (!fromChatId || !toChatId || fromChatId === toChatId) return;
            state.canvasByChatId = state.canvasByChatId || {};
            const bucket = state.canvasByChatId[fromChatId];
            if (bucket) {
                state.canvasByChatId[toChatId] = bucket;
                delete state.canvasByChatId[fromChatId];
            }
            if (state.activeCanvasChatId === fromChatId) {
                state.activeCanvasChatId = toChatId;
            }
        },
        // Drop a chat's canvas bucket entirely (e.g. when the user starts a
        // brand new chat from NEW_CHAT_ID and abandons the prior in-flight one).
        clearCanvasForChat: (state, action) => {
            const chatId = action.payload;
            if (!chatId) return;
            state.canvasByChatId = state.canvasByChatId || {};
            delete state.canvasByChatId[chatId];
            if (state.activeCanvasChatId === chatId) {
                applyCanvasSnapshot(state, null);
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(toggleArticles, (state) => {
            state.includeArticles = !state.includeArticles;
        });
        builder.addCase(focusChatInput, (state) => {
            // This is just a trigger action, doesn't modify state
            // The actual focus will be handled by a listener in ChatContent
            state.focusTrigger = Date.now();
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
    openCanvas,
    closeCanvas,
    addCanvasTab,
    closeCanvasTab,
    switchCanvasTab,
    updateCanvasTab,
    refreshActiveHtmlCanvas,
    toggleCanvasVisibility,
    setCanvasVisibility,
    setCanvasWidth,
    incrementFileBrowserRefresh,
    restoreCanvasState,
    setActiveCanvasChat,
    promoteCanvasChatId,
    clearCanvasForChat,
} = chatSlice.actions;

export default chatSlice.reducer;
