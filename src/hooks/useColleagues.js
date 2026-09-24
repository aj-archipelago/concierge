import { useContext } from "react";
import { CurrentUserContext } from "../App";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApolloClient } from "@apollo/client";
import { SYS_GET_ENTITIES } from "../graphql";
import axios from "axios";
export function useAssistantDirectory({ enabled = true, ...options } = {}) {
    const user = useContext(CurrentUserContext);
    return useQuery({
        queryKey: ["colleagues", user?._id, options],
        queryFn: async ({ signal }) => {
            const fetchPage = async (pageOptions) => {
                const params = new URLSearchParams();
                for (const [key, value] of Object.entries(pageOptions)) {
                    if (value !== undefined && value !== null)
                        params.set(
                            key,
                            Array.isArray(value)
                                ? value.join(",")
                                : String(value),
                        );
                }
                return (
                    await axios.get(`/api/colleagues?${params}`, { signal })
                ).data;
            };
            if (!options.ids || options.ids.length <= 100)
                return fetchPage(options);
            // References already visible in task/inbox history may span more
            // than one page. Resolve them in bounded batches, never a full scan.
            const colleagues = [];
            for (let offset = 0; offset < options.ids.length; offset += 100) {
                signal.throwIfAborted();
                const page = await fetchPage({
                    ...options,
                    ids: options.ids.slice(offset, offset + 100),
                    limit: 100,
                });
                colleagues.push(...page.colleagues);
            }
            return { colleagues, total: colleagues.length, nextOffset: null };
        },
        staleTime: 15000,
        enabled: enabled && (!options.ids || options.ids.length > 0),
    });
}
export function useColleagues(options = {}) {
    const query = useAssistantDirectory(options);
    return { ...query, page: query.data, data: query.data?.colleagues };
}
export function useAssistant(id) {
    const user = useContext(CurrentUserContext);
    return useQuery({
        queryKey: ["assistant", user?._id, id],
        queryFn: async ({ signal }) =>
            (
                await axios.get(`/api/colleagues/${encodeURIComponent(id)}`, {
                    signal,
                })
            ).data,
        enabled: Boolean(id),
        staleTime: 15000,
        retry: false,
    });
}
export function useSaveColleague() {
    const client = useQueryClient();
    const apollo = useApolloClient();
    return useMutation({
        mutationFn: async ({ id, ...settings }) =>
            (
                await (id
                    ? axios.patch(`/api/colleagues/${id}`, settings)
                    : axios.post("/api/colleagues", settings))
            ).data,
        onSuccess: async () => {
            client.invalidateQueries({ queryKey: ["colleagues"] });
            client.invalidateQueries({ queryKey: ["assistant"] });
            client.invalidateQueries({ queryKey: ["currentUser"] });
            // Chat uses Apollo, not React Query. Evict inactive listings too,
            // so navigating to a chat cannot revive a pre-creation snapshot.
            try {
                await apollo.refetchQueries({
                    include: [SYS_GET_ENTITIES],
                    updateCache(cache) {
                        cache.evict({ fieldName: "sys_get_entities" });
                    },
                });
            } catch (error) {
                console.warn("Could not refresh the chat entity list", error);
            }
        },
    });
}
