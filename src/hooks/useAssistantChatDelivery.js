"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CurrentUserContext } from "../App";
import axios from "../../app/utils/axios-client";
import { useMarkNotificationsRead } from "../../app/queries/notifications";

const POLL_MS = 5000;
const SEEN_MS = 350;
const pageHasAttention = () =>
    document.visibilityState === "visible" && document.hasFocus();

export function useAssistantChatDelivery({
    chatId,
    containerRef,
    messages = [],
    enabled = true,
    busy = false,
}) {
    const user = useContext(CurrentUserContext);
    const queryClient = useQueryClient();
    const markRead = useMarkNotificationsRead();
    const markReadRef = useRef(markRead.mutateAsync);
    markReadRef.current = markRead.mutateAsync;
    const [focused, setFocused] = useState(false);
    const [visible, setVisible] = useState(false);
    const inFlight = useRef(new Set());
    const lastRefresh = useRef(null);

    useEffect(() => {
        const update = () => setFocused(pageHasAttention());
        update();
        window.addEventListener("focus", update);
        window.addEventListener("blur", update);
        document.addEventListener("visibilitychange", update);
        return () => {
            window.removeEventListener("focus", update);
            window.removeEventListener("blur", update);
            document.removeEventListener("visibilitychange", update);
        };
    }, []);

    useEffect(() => {
        setVisible(false);
        const surface = containerRef.current;
        if (
            !enabled ||
            !chatId ||
            !surface ||
            typeof IntersectionObserver === "undefined"
        )
            return;
        const observer = new IntersectionObserver(([entry]) => {
            setVisible(
                entry.isIntersecting &&
                    entry.intersectionRect.width > 0 &&
                    entry.intersectionRect.height > 0,
            );
        });
        observer.observe(surface);
        return () => observer.disconnect();
    }, [chatId, containerRef, enabled]);

    const watching = !!chatId && enabled && visible && focused;
    const queryKey = ["chat-deliveries", user?._id, chatId];
    const arrivals = useQuery({
        queryKey,
        enabled: watching,
        queryFn: async ({ signal }) =>
            (
                await axios.get(
                    `/api/chats/${encodeURIComponent(chatId)}/deliveries`,
                    { signal },
                )
            ).data,
        refetchInterval: POLL_MS,
        refetchIntervalInBackground: false,
        staleTime: 0,
        retry: false,
    });
    const deliveries = arrivals.data?.deliveries;

    useEffect(() => {
        if (!watching || busy || !deliveries?.length) return;
        const present = new Set(messages.map((m) => String(m._id)));
        if (!deliveries.some((d) => !present.has(d.messageId))) return;
        const refreshKey = `${chatId}:${arrivals.dataUpdatedAt}`;
        if (lastRefresh.current === refreshKey) return;
        lastRefresh.current = refreshKey;
        // The normal chat query merges persisted messages with local state.
        // Defer until the foreground reply settles; never replace its draft.
        queryClient.invalidateQueries({
            queryKey: ["chat", String(chatId)],
            exact: true,
        });
    }, [
        watching,
        busy,
        deliveries,
        messages,
        chatId,
        arrivals.dataUpdatedAt,
        queryClient,
    ]);

    useEffect(() => {
        const surface = containerRef.current;
        if (!watching || busy || !surface || !deliveries?.length) return;
        const byMessage = new Map(
            deliveries
                .filter((d) => d.kind === "result")
                .map((d) => [d.messageId, d]),
        );
        const timers = new Map();
        let cancelled = false;
        const acknowledge = async (delivery) => {
            if (
                cancelled ||
                !pageHasAttention() ||
                !surface.getClientRects().length ||
                inFlight.current.has(delivery.id)
            )
                return;
            inFlight.current.add(delivery.id);
            try {
                await markReadRef.current({ ids: [delivery.id] });
                queryClient.setQueryData(
                    ["chat-deliveries", user?._id, chatId],
                    (old) =>
                        old && {
                            ...old,
                            deliveries: old.deliveries.filter(
                                (d) => d.id !== delivery.id,
                            ),
                        },
                );
            } catch {
                // Keep the server's unread receipt. A later poll retries.
            } finally {
                inFlight.current.delete(delivery.id);
            }
        };
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const delivery = byMessage.get(entry.target.dataset.messageId);
                if (!delivery) continue;
                clearTimeout(timers.get(delivery.id));
                timers.delete(delivery.id);
                if (
                    !entry.isIntersecting ||
                    entry.intersectionRect.width <= 0 ||
                    entry.intersectionRect.height <= 0
                )
                    continue;
                // Allow the rendered message to settle before acknowledging it.
                timers.set(
                    delivery.id,
                    setTimeout(acknowledge, SEEN_MS, delivery),
                );
            }
        });
        for (const row of surface.querySelectorAll("[data-message-id]")) {
            if (byMessage.has(row.dataset.messageId)) observer.observe(row);
        }
        return () => {
            cancelled = true;
            observer.disconnect();
            timers.forEach(clearTimeout);
        };
    }, [
        watching,
        busy,
        deliveries,
        messages,
        chatId,
        containerRef,
        queryClient,
        user?._id,
        arrivals.dataUpdatedAt,
    ]);
}
