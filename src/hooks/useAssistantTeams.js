"use client";
import { useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CurrentUserContext } from "../App";
import axios from "../../app/utils/axios-client";

// Keep only the visible page live. Browsing history must not turn one poll
// into requests for every page the user has ever opened.
export function useAssistantTeams({
    chatId,
    status = "all",
    enabled = true,
} = {}) {
    const user = useContext(CurrentUserContext);
    const scope = JSON.stringify([user?._id, chatId, status]);
    const [navigation, setNavigation] = useState({ scope, cursors: [] });
    const cursors = navigation.scope === scope ? navigation.cursors : [];
    const cursor = cursors.at(-1) || null;
    const query = useQuery({
        queryKey: ["assistant-teams", user?._id, { chatId, status, cursor }],
        enabled,
        queryFn: async ({ signal }) => {
            const params = new URLSearchParams({
                status,
                limit: chatId ? "5" : "20",
            });
            if (chatId) params.set("chatId", chatId);
            if (cursor) params.set("cursor", cursor);
            return (
                await axios.get(`/api/assistant-teams?${params}`, { signal })
            ).data;
        },
        refetchInterval: (query) =>
            query.state.data?.teams?.some((team) =>
                ["pending", "in_progress", "waiting"].includes(
                    team.taskStatus || team.status,
                ),
            )
                ? 5000
                : cursor || status === "history"
                  ? false
                  : 30000,
        refetchIntervalInBackground: false,
        retry: false,
        staleTime: 2000,
    });
    return {
        ...query,
        data: query.data ? { pages: [query.data] } : undefined,
        hasNextPage: Boolean(query.data?.nextCursor),
        hasPreviousPage: cursors.length > 0,
        isFetchingNextPage: query.isFetching,
        fetchNextPage: () => {
            if (query.data?.nextCursor && !query.isFetching)
                setNavigation({
                    scope,
                    cursors: [...cursors, query.data.nextCursor],
                });
        },
        fetchPreviousPage: () =>
            setNavigation({ scope, cursors: cursors.slice(0, -1) }),
    };
}
export function useAssistantTeam(id) {
    const user = useContext(CurrentUserContext);
    return useQuery({
        queryKey: ["assistant-team", user?._id, id],
        enabled: !!id,
        queryFn: async ({ signal }) =>
            (
                await axios.get(
                    `/api/assistant-teams/${encodeURIComponent(id)}`,
                    { signal },
                )
            ).data.team,
        refetchInterval: (query) =>
            ["pending", "in_progress", "waiting"].includes(
                query.state.data?.taskStatus || query.state.data?.status,
            )
                ? 5000
                : false,
        refetchIntervalInBackground: false,
        retry: false,
        staleTime: 2000,
    });
}
