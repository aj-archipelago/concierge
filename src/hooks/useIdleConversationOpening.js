import { useEffect, useRef } from "react";

export const CONVERSATION_IDLE_MS = 3000;
const FRESH_CHAT_MS = 5 * 60_000;
const handled = new Set();
const storageKey = (id) => `concierge-chat-opening:${id}`;

function wasHandled(id) {
    try {
        return (
            handled.has(id) ||
            sessionStorage.getItem(storageKey(id)) === "handled"
        );
    } catch {
        return handled.has(id);
    }
}
function markHandled(id) {
    handled.add(id);
    try {
        sessionStorage.setItem(storageKey(id), "handled");
    } catch {}
}

// No state updates on pointer movement. The clock runs only on the visible,
// focused chat, and any evidence of composing permanently yields to the user.
export function useIdleConversationOpening({
    chatId,
    entityId,
    createdAt,
    enabled,
    ready,
    hasIntent,
    inputRef,
    language,
    onStateChange,
    onCommitted,
}) {
    const callbacks = useRef({ onStateChange, onCommitted });
    callbacks.current = { onStateChange, onCommitted };

    useEffect(() => {
        if (!chatId || !enabled || !ready || wasHandled(chatId)) return;
        if (hasIntent) {
            markHandled(chatId);
            return;
        }
        const created = new Date(createdAt).getTime();
        if (!Number.isFinite(created) || Date.now() - created > FRESH_CHAT_MS)
            return;
        let timer;
        let controller;
        let stopped = false;
        let token;
        const target = { chatId, entityId };
        const visible = () =>
            document.visibilityState === "visible" &&
            document.hasFocus() &&
            inputRef.current?.getClientRects().length > 0 &&
            !document.querySelector(
                '[role="dialog"], [role="menu"], [role="listbox"]',
            );

        const stop = () => {
            if (stopped) return;
            stopped = true;
            clearTimeout(timer);
            markHandled(chatId);
            if (controller) {
                controller.abort();
                callbacks.current.onStateChange?.({ ...target, busy: false });
                fetch(`/api/chats/${chatId}/opening`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "cancel", token }),
                    keepalive: true,
                }).catch(() => {});
            }
        };
        const start = async () => {
            if (stopped) return;
            if (!visible()) {
                schedule();
                return;
            }
            // Read the DOM as well as state: composition/paste can precede a render.
            if (inputRef.current?.value) {
                stop();
                return;
            }
            if (wasHandled(chatId)) return;
            markHandled(chatId);
            controller = new AbortController();
            token = crypto.randomUUID();
            callbacks.current.onStateChange?.({ ...target, busy: true });
            const request = async (action) => {
                const response = await fetch(`/api/chats/${chatId}/opening`, {
                    method: "POST",
                    signal: controller.signal,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action,
                        token,
                        entityId,
                        language,
                        timezone:
                            Intl.DateTimeFormat().resolvedOptions().timeZone,
                    }),
                });
                if (!response.ok)
                    throw new Error("Conversation opening unavailable");
                return response.json();
            };
            try {
                const result = await request("prepare");
                if (
                    !result.ready ||
                    stopped ||
                    !visible() ||
                    inputRef.current?.value
                ) {
                    stop();
                    return;
                }
                const committed = await request("commit");
                if (committed.committed && !stopped) {
                    controller = null;
                    stopped = true;
                    await callbacks.current.onCommitted?.(target);
                }
            } catch {
                // An unsolicited opening must never interrupt a user's task
                // with an error banner, retries, or a disabled composer.
                stop();
            } finally {
                callbacks.current.onStateChange?.({ ...target, busy: false });
                controller = null;
                stopped = true;
                clearTimeout(timer);
            }
        };
        const schedule = () => {
            clearTimeout(timer);
            if (stopped) return;
            if (controller) {
                stop();
                return;
            }
            if (document.visibilityState === "visible" && document.hasFocus()) {
                timer = setTimeout(start, CONVERSATION_IDLE_MS);
            }
        };
        const keydown = (event) => {
            if (!["Shift", "Control", "Alt", "Meta"].includes(event.key))
                stop();
        };
        const hardEvents = [
            "beforeinput",
            "paste",
            "compositionstart",
            "dragenter",
            "drop",
        ];
        const idleEvents = [
            "pointermove",
            "pointerdown",
            "wheel",
            "focus",
            "blur",
        ];
        hardEvents.forEach((event) =>
            window.addEventListener(event, stop, true),
        );
        idleEvents.forEach((event) =>
            window.addEventListener(event, schedule, { passive: true }),
        );
        window.addEventListener("keydown", keydown, true);
        document.addEventListener("visibilitychange", schedule);
        schedule();
        return () => {
            clearTimeout(timer);
            // Strict Mode cleanup before a request must not consume the opening.
            if (controller) stop();
            hardEvents.forEach((event) =>
                window.removeEventListener(event, stop, true),
            );
            idleEvents.forEach((event) =>
                window.removeEventListener(event, schedule),
            );
            window.removeEventListener("keydown", keydown, true);
            document.removeEventListener("visibilitychange", schedule);
        };
    }, [
        chatId,
        entityId,
        createdAt,
        enabled,
        ready,
        hasIntent,
        inputRef,
        language,
    ]);
}
