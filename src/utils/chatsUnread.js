/**
 * Per-chat "last viewed" timestamps and attention flags for sidebar status dots.
 *
 * Status comes from the active-chats API + client attention map:
 * - `needsAttention` → yellow (confirmation pending / focus-required tool blocked)
 * - `isChatLoading` / `latestTaskStatus` in pending|in_progress → pulse gray
 * - terminal `latestTaskStatus` after last view → blue/red
 * - assistant `lastMessageAt` after last view (stream finished while away) → blue
 * Idle chats show a static gray dot. Opening the chat marks it viewed and clears attention.
 */
export const CHATS_LAST_VIEWED_STORAGE_KEY = "concierge-chats-last-viewed-v1";
export const CHAT_ATTENTION_QUERY_KEY = ["chatAttentionMap"];

const ACTIVE_DOT_STATUSES = new Set(["pending", "in_progress"]);
const TERMINAL_DOT_STATUSES = new Set(["completed", "failed"]);
const ASSISTANT_SENDERS = new Set(["concierge", "assistant"]);

function isChatLinkedTask(task) {
    return Boolean(task?.invokedFrom?.chatId);
}

function readLastViewedMap() {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(CHATS_LAST_VIEWED_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeLastViewedMap(map) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            CHATS_LAST_VIEWED_STORAGE_KEY,
            JSON.stringify(map),
        );
    } catch {
        // ignore storage failures
    }
}

export function getChatLastViewedAt(chatId) {
    if (!chatId) return null;
    const value = readLastViewedMap()[String(chatId)];
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function markChatViewed(chatId, at = new Date()) {
    if (!chatId) return null;
    const iso = new Date(at).toISOString();
    const map = readLastViewedMap();
    map[String(chatId)] = iso;
    writeLastViewedMap(map);
    return iso;
}

function normalizeAttentionMap(map) {
    return map && typeof map === "object" ? map : {};
}

export function getChatNeedsAttention(attentionMap, chatId) {
    if (!chatId) return false;
    return Boolean(normalizeAttentionMap(attentionMap)[String(chatId)]);
}

export function markChatNeedsAttention(queryClient, chatId) {
    if (!queryClient || !chatId) return false;
    const key = String(chatId);
    let changed = false;
    queryClient.setQueryData(CHAT_ATTENTION_QUERY_KEY, (old) => {
        const map = normalizeAttentionMap(old);
        if (map[key]) return map;
        changed = true;
        return { ...map, [key]: new Date().toISOString() };
    });
    return changed;
}

export function clearChatNeedsAttention(queryClient, chatId) {
    if (!queryClient || !chatId) return false;
    const key = String(chatId);
    let changed = false;
    queryClient.setQueryData(CHAT_ATTENTION_QUERY_KEY, (old) => {
        const map = normalizeAttentionMap(old);
        if (!map[key]) return map;
        changed = true;
        const next = { ...map };
        delete next[key];
        return next;
    });
    return changed;
}

/**
 * Returns a sidebar chat status for the status dot:
 * - "needs_attention" — yellow (waiting on the user)
 * - "in_progress" — pulsating gray (stream or task still running)
 * - "completed" — blue (finished while away / unread)
 * - "failed" — red (failed while away)
 * - "idle" — static gray (default / viewed / no active task)
 */
export function getChatTaskNotificationStatus(
    chat,
    lastViewedAt,
    { isCurrentlyViewing = false, needsAttention = false } = {},
) {
    // Needs attention beats in-progress: the user must switch back / confirm.
    if (needsAttention && !isCurrentlyViewing) {
        return "needs_attention";
    }

    const status = chat?.latestTaskStatus;
    if (chat?.isChatLoading || ACTIVE_DOT_STATUSES.has(status)) {
        return "in_progress";
    }

    // Opening the chat clears terminal unread/error indicators.
    if (isCurrentlyViewing) return "idle";

    if (TERMINAL_DOT_STATUSES.has(status)) {
        const taskAt = Date.parse(chat?.latestTaskAt);
        if (!Number.isNaN(taskAt)) {
            if (!lastViewedAt) return status;
            const viewedAt = Date.parse(lastViewedAt);
            if (Number.isNaN(viewedAt) || taskAt > viewedAt) return status;
        }
    }

    // Stream finished while away: assistant message after last view.
    // Require a prior lastViewedAt so first-time sidebar loads stay idle gray.
    if (lastViewedAt && chat?.lastMessageAt) {
        const messageAt = Date.parse(chat.lastMessageAt);
        const viewedAt = Date.parse(lastViewedAt);
        if (
            !Number.isNaN(messageAt) &&
            !Number.isNaN(viewedAt) &&
            messageAt > viewedAt &&
            ASSISTANT_SENDERS.has(chat?.lastMessageSender)
        ) {
            return "completed";
        }
    }

    return "idle";
}

/**
 * Optimistically patch the active-chats cache when a chat-linked task
 * changes status (pending/in_progress/completed/failed).
 */
export function applyChatTaskStatusToActiveChats(queryClient, task) {
    if (!queryClient || !task) return false;
    if (!isChatLinkedTask(task)) {
        return false;
    }
    const status = task.status;
    if (
        !ACTIVE_DOT_STATUSES.has(status) &&
        !TERMINAL_DOT_STATUSES.has(status)
    ) {
        return false;
    }

    const chatId = String(task.invokedFrom.chatId);
    const taskAt = task.updatedAt || task.createdAt || new Date().toISOString();

    let changed = false;
    queryClient.setQueryData(["activeChats"], (oldData = []) => {
        if (!Array.isArray(oldData)) return oldData;
        const next = oldData.map((chat) => {
            if (String(chat?._id) !== chatId) return chat;
            const prevAt = chat?.latestTaskAt
                ? Date.parse(chat.latestTaskAt)
                : 0;
            const nextAt = Date.parse(taskAt);
            if (
                !Number.isNaN(prevAt) &&
                !Number.isNaN(nextAt) &&
                nextAt < prevAt
            ) {
                return chat;
            }
            const nextTaskAt = Number.isNaN(nextAt)
                ? taskAt
                : new Date(nextAt).toISOString();
            if (
                chat?.latestTaskStatus === status &&
                chat?.latestTaskAt === nextTaskAt
            ) {
                return chat;
            }
            changed = true;
            return {
                ...chat,
                latestTaskStatus: status,
                latestTaskAt: nextTaskAt,
            };
        });
        return changed ? next : oldData;
    });

    if (changed) {
        queryClient.invalidateQueries({ queryKey: ["activeChats"] });
        queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    }
    return changed;
}
