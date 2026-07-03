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
    const hasReloadSource = Boolean(
        content.url ||
            content.workspacePath ||
            content.appletId ||
            content.fileHash ||
            content.blobPath,
    );
    const {
        content: _bodyContent,
        headline: _headline,
        subhead: _subhead,
        featuredImageUrl: _featuredImageUrl,
        htmlStatus: _htmlStatus,
        htmlError: _htmlError,
        ...rest
    } = content;
    if (hasReloadSource) {
        delete rest.htmlContent;
    }
    // Applet blob URLs must not be persisted — on restore, we re-validate access
    // via /api/canvas-applets/{id} instead of fetching the blob directly.
    if (rest.appletId) {
        delete rest.url;
    }
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

const PENDING_CANVAS_CHAT_ID = "__pending__";

function normalizeCanvasSnapshot(snapshot) {
    const safe = snapshot || EMPTY_CANVAS;
    return {
        canvasContent: safe.canvasContent ?? null,
        canvasTabs: Array.isArray(safe.canvasTabs) ? [...safe.canvasTabs] : [],
        activeTabId: safe.activeTabId ?? null,
        canvasVisible:
            typeof safe.canvasVisible === "boolean" ? safe.canvasVisible : true,
    };
}

function getCanvasTargetChatId(state, chatId) {
    return chatId
        ? String(chatId)
        : state.activeCanvasChatId || PENDING_CANVAS_CHAT_ID;
}

function shouldMirrorCanvasTarget(state, targetChatId) {
    return (
        targetChatId === state.activeCanvasChatId ||
        (!state.activeCanvasChatId && targetChatId === PENDING_CANVAS_CHAT_ID)
    );
}

function mutateCanvasBucket(state, chatId, updater) {
    const targetChatId = getCanvasTargetChatId(state, chatId);
    if (!state.canvasByChatId) {
        state.canvasByChatId = {};
    }
    const currentBucket =
        targetChatId === state.activeCanvasChatId
            ? snapshotActiveCanvas(state)
            : state.canvasByChatId[targetChatId];
    const bucket = normalizeCanvasSnapshot(currentBucket);

    const didChange = updater(bucket);
    if (didChange === false) return;

    state.canvasByChatId[targetChatId] = bucket;
    if (shouldMirrorCanvasTarget(state, targetChatId)) {
        applyCanvasSnapshot(state, bucket);
    }
}

function applyCanvasSnapshot(state, snapshot) {
    const safe = normalizeCanvasSnapshot(snapshot);
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

function openCanvasInBucket(bucket, payload) {
    if (!payload) return;
    let tabId = payload.tabId;

    if (!tabId) {
        const dup = findTabByContent(bucket.canvasTabs, payload);
        tabId = dup?.id || uuidv4();
    }

    if (bucket.canvasTabs.length === 0) {
        bucket.canvasTabs = [
            {
                id: tabId,
                content: payload,
                title: payload.title || payload.filename || "Canvas",
            },
        ];
        bucket.activeTabId = tabId;
    } else {
        const existingTabIndex = bucket.canvasTabs.findIndex(
            (tab) => tab.id === tabId,
        );
        if (existingTabIndex >= 0) {
            bucket.canvasTabs[existingTabIndex].content = payload;
            bucket.canvasTabs[existingTabIndex].title =
                payload.title ||
                payload.filename ||
                bucket.canvasTabs[existingTabIndex].title;
            bucket.activeTabId = tabId;
        } else {
            bucket.canvasTabs.push({
                id: tabId,
                content: payload,
                title: payload.title || payload.filename || "Canvas",
            });
            bucket.activeTabId = tabId;
        }
    }

    bucket.canvasContent = payload;
    bucket.canvasVisible = true;
}

function addCanvasTabInBucket(bucket, payload) {
    const dup = findTabByContent(bucket.canvasTabs, payload);
    if (dup) {
        bucket.activeTabId = dup.id;
        bucket.canvasContent = dup.content;
        bucket.canvasVisible = true;
        return;
    }

    const tabId = uuidv4();
    const newTab = {
        id: tabId,
        content: payload,
        title: payload.title || payload.filename || "Canvas",
    };
    bucket.canvasTabs.push(newTab);
    bucket.activeTabId = tabId;
    bucket.canvasContent = newTab.content;
    bucket.canvasVisible = true;
}

function closeCanvasTabInBucket(bucket, tabId) {
    const tabIndex = bucket.canvasTabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex < 0) return;

    bucket.canvasTabs.splice(tabIndex, 1);

    if (bucket.activeTabId === tabId) {
        if (bucket.canvasTabs.length > 0) {
            const newActiveIndex = Math.max(0, tabIndex - 1);
            bucket.activeTabId = bucket.canvasTabs[newActiveIndex].id;
            bucket.canvasContent = bucket.canvasTabs[newActiveIndex].content;
        } else {
            bucket.activeTabId = null;
            bucket.canvasContent = null;
        }
    }
}

function switchCanvasTabInBucket(bucket, tabId) {
    const tab = bucket.canvasTabs.find((t) => t.id === tabId);
    if (!tab) return;
    bucket.activeTabId = tabId;
    bucket.canvasContent = tab.content;
}

function buildCanvasTabMetadata(content = {}) {
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
        appletActiveVersionNumber: content.appletActiveVersionNumber,
        appletIsViewingDraft: content.appletIsViewingDraft,
        workspaceContentVersion: content.workspaceContentVersion,
    };

    return Object.fromEntries(
        Object.entries(raw).filter(([, value]) => value !== undefined),
    );
}

function updateCanvasTabInBucket(bucket, { tabId, content = {} } = {}) {
    const tab = bucket.canvasTabs.find((t) => t.id === tabId);
    if (!tab) return false;

    const metadata = buildCanvasTabMetadata(content);
    const nextTitle = content.title || content.filename || tab.title;
    const metadataUnchanged = Object.entries(metadata).every(
        ([key, value]) => tab.content?.[key] === value,
    );
    if (metadataUnchanged && tab.title === nextTitle) {
        return false;
    }

    tab.content = { ...tab.content, ...metadata };
    tab.title = nextTitle;

    if (bucket.activeTabId === tabId) {
        bucket.canvasContent = {
            ...bucket.canvasContent,
            ...metadata,
        };
    }
    return true;
}

function refreshActiveHtmlCanvasInBucket(bucket, { htmlContent, tabId }) {
    const targetTabId = tabId || bucket.activeTabId;
    if (!targetTabId) return;
    const tab = bucket.canvasTabs.find((t) => t.id === targetTabId);
    if (!tab || tab.content?.type !== "html") return;

    tab.content = { ...tab.content, htmlContent, htmlStatus: "live" };
    if (bucket.activeTabId === targetTabId) {
        bucket.canvasContent = {
            ...bucket.canvasContent,
            htmlContent,
            htmlStatus: "live",
        };
    }
}

function closeCanvasInBucket(bucket) {
    bucket.canvasContent = null;
    bucket.canvasTabs = [];
    bucket.activeTabId = null;
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
            mutateCanvasBucket(state, null, (bucket) => {
                openCanvasInBucket(bucket, action.payload);
            });
        },
        openCanvasForChat: (state, action) => {
            const { chatId, canvas } = action.payload || {};
            mutateCanvasBucket(state, chatId, (bucket) => {
                openCanvasInBucket(bucket, canvas);
            });
        },
        addCanvasTab: (state, action) => {
            const payload = action.payload || {
                type: "empty",
                title: "Canvas",
            };
            mutateCanvasBucket(state, null, (bucket) => {
                addCanvasTabInBucket(bucket, payload);
            });
        },
        addCanvasTabForChat: (state, action) => {
            const { chatId, canvas } = action.payload || {};
            const payload = canvas || {
                type: "empty",
                title: "Canvas",
            };
            mutateCanvasBucket(state, chatId, (bucket) => {
                addCanvasTabInBucket(bucket, payload);
            });
        },
        closeCanvasTab: (state, action) => {
            mutateCanvasBucket(state, null, (bucket) => {
                closeCanvasTabInBucket(bucket, action.payload);
            });
        },
        closeCanvasTabForChat: (state, action) => {
            const { chatId, tabId } = action.payload || {};
            mutateCanvasBucket(state, chatId, (bucket) => {
                closeCanvasTabInBucket(bucket, tabId);
            });
        },
        switchCanvasTab: (state, action) => {
            mutateCanvasBucket(state, null, (bucket) => {
                switchCanvasTabInBucket(bucket, action.payload);
            });
        },
        switchCanvasTabForChat: (state, action) => {
            const { chatId, tabId } = action.payload || {};
            mutateCanvasBucket(state, chatId, (bucket) => {
                switchCanvasTabInBucket(bucket, tabId);
            });
        },
        updateCanvasTab: (state, action) => {
            mutateCanvasBucket(state, null, (bucket) => {
                return updateCanvasTabInBucket(bucket, action.payload);
            });
        },
        updateCanvasTabForChat: (state, action) => {
            const { chatId, tabId, content } = action.payload || {};
            mutateCanvasBucket(state, chatId, (bucket) => {
                return updateCanvasTabInBucket(bucket, { tabId, content });
            });
        },
        refreshActiveHtmlCanvas: (state, action) => {
            mutateCanvasBucket(state, null, (bucket) => {
                refreshActiveHtmlCanvasInBucket(bucket, action.payload);
            });
        },
        refreshHtmlCanvasForChat: (state, action) => {
            const { chatId, htmlContent, tabId } = action.payload || {};
            mutateCanvasBucket(state, chatId, (bucket) => {
                refreshActiveHtmlCanvasInBucket(bucket, { htmlContent, tabId });
            });
        },
        closeCanvas: (state) => {
            mutateCanvasBucket(state, null, closeCanvasInBucket);
        },
        closeCanvasForChat: (state, action) => {
            const { chatId } = action.payload || {};
            mutateCanvasBucket(state, chatId, closeCanvasInBucket);
        },
        toggleCanvasVisibility: (state) => {
            mutateCanvasBucket(state, null, (bucket) => {
                bucket.canvasVisible = !bucket.canvasVisible;
            });
        },
        setCanvasVisibility: (state, action) => {
            mutateCanvasBucket(state, null, (bucket) => {
                bucket.canvasVisible = action.payload;
            });
        },
        setCanvasVisibilityForChat: (state, action) => {
            const { chatId, visible } = action.payload || {};
            mutateCanvasBucket(state, chatId, (bucket) => {
                bucket.canvasVisible = visible;
            });
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
                const pending = state.canvasByChatId[PENDING_CANVAS_CHAT_ID];
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
                    delete state.canvasByChatId[PENDING_CANVAS_CHAT_ID];
                } else {
                    bucket = state.canvasByChatId[nextChatId];
                    if (
                        !bucket &&
                        state.canvasByChatId[PENDING_CANVAS_CHAT_ID]
                    ) {
                        bucket = state.canvasByChatId[PENDING_CANVAS_CHAT_ID];
                        state.canvasByChatId[nextChatId] = bucket;
                        delete state.canvasByChatId[PENDING_CANVAS_CHAT_ID];
                    }
                }
                applyCanvasSnapshot(state, bucket);
            } else {
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
    openCanvasForChat,
    closeCanvas,
    closeCanvasForChat,
    addCanvasTab,
    addCanvasTabForChat,
    closeCanvasTab,
    closeCanvasTabForChat,
    switchCanvasTab,
    switchCanvasTabForChat,
    updateCanvasTab,
    updateCanvasTabForChat,
    refreshActiveHtmlCanvas,
    refreshHtmlCanvasForChat,
    toggleCanvasVisibility,
    setCanvasVisibility,
    setCanvasVisibilityForChat,
    setCanvasWidth,
    incrementFileBrowserRefresh,
    restoreCanvasState,
    setActiveCanvasChat,
} = chatSlice.actions;

export default chatSlice.reducer;
