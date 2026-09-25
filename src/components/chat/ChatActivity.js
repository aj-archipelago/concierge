"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import EntityIcon from "./EntityIcon";

const EMPTY = {};
const ChatActivityContext = createContext({
    activity: { phase: "idle" },
    report: () => {},
});

export function streamActivity(stream, entityId) {
    if (!stream?.isStreaming) return "idle";
    if (stream.entityId && stream.entityId !== entityId) return "elsewhere";
    if (stream.currentResultIsEphemeral || !stream.streamingContent)
        return "thinking";
    const last = stream.inlinePayloadItems?.at(-1);
    if (last) {
        try {
            const item = typeof last === "string" ? JSON.parse(last) : last;
            if (item.type === "tool_event" && item.status === "thinking")
                return "thinking";
        } catch {
            /* Older streams can contain plain text. */
        }
    }
    return "replying";
}

export function resolveChatActivity(state, streamPhase = "idle") {
    if (streamPhase === "elsewhere")
        return state.drafting ? "interested" : "idle";
    if (state.attention) return "attention";
    if (state.outcome)
        return state.outcome === "stopped" ? "idle" : state.outcome;
    if (streamPhase !== "idle") return streamPhase;
    if (state.busy) return "thinking";
    return state.drafting ? "interested" : "idle";
}

// Local to this chat surface. An old request cannot animate a different chat
// or colleague after navigation, and drafting never leaves the browser.
export function ChatActivityProvider({ chatId, entityId, children }) {
    const scope = `${chatId || ""}:${entityId || ""}`;
    const scopeRef = useRef(scope);
    scopeRef.current = scope;
    const [stored, setStored] = useState(EMPTY);
    const state = stored.scope === scope ? stored : EMPTY;
    const report = useCallback(
        (patch) => {
            if (scopeRef.current !== scope) return;
            setStored((previous) => {
                const current = previous.scope === scope ? previous : EMPTY;
                if (
                    Object.entries(patch).every(
                        ([key, value]) => current[key] === value,
                    )
                )
                    return previous;
                return { ...current, ...patch, scope };
            });
        },
        [scope],
    );
    const select = useCallback(
        (stream) => streamActivity(stream, entityId),
        [entityId],
    );
    const { data: streamPhase = "idle" } = useQuery({
        queryKey: ["stream", chatId ? String(chatId) : null],
        queryFn: () => ({ isStreaming: false }),
        select,
        enabled: false,
        staleTime: Infinity,
        gcTime: Infinity,
    });
    const phase = resolveChatActivity(state, streamPhase);
    const value = useMemo(
        () => ({ activity: { phase }, report }),
        [phase, report],
    );
    return (
        <ChatActivityContext.Provider value={value}>
            {children}
        </ChatActivityContext.Provider>
    );
}

export const useChatActivity = () => useContext(ChatActivityContext);

export function ChatEntityIcon({ entity, size }) {
    const { activity } = useChatActivity();
    return (
        <EntityIcon
            key={entity?.id}
            entity={entity}
            size={size}
            activity={activity}
        />
    );
}
