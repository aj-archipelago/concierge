"use client";

import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import axios from "../../app/utils/axios-client";

export function useAutomations() {
    return useQuery({
        queryKey: ["automations"],
        queryFn: async () => {
            const { data } = await axios.get("/api/automations");
            return data.automations || [];
        },
    });
}

export function usePinnedAutomations() {
    return useQuery({
        queryKey: ["automations", "pinned"],
        queryFn: async () => {
            const { data } = await axios.get("/api/automations/pinned");
            return data.automations || [];
        },
        staleTime: 60 * 1000,
    });
}

export function useAutomation(id) {
    return useQuery({
        queryKey: ["automations", id],
        enabled: !!id,
        queryFn: async () => {
            const { data } = await axios.get(
                `/api/automations/${encodeURIComponent(id)}`,
            );
            return data;
        },
        // The editor form is hydrated from this query's data. Auto-refetching
        // while the user is editing would race with their typing.
        refetchOnWindowFocus: false,
    });
}

export function useAutomationRuns(id) {
    return useInfiniteQuery({
        queryKey: ["automations", id, "runs"],
        enabled: !!id,
        initialPageParam: 1,
        queryFn: async ({ pageParam = 1 }) => {
            const { data } = await axios.get(
                `/api/automations/${encodeURIComponent(id)}/runs?page=${pageParam}&limit=20`,
            );
            return data;
        },
        getNextPageParam: (lastPage, pages) =>
            lastPage.hasMore ? pages.length + 1 : undefined,
        refetchInterval: (query) => {
            const runs =
                query.state.data?.pages?.flatMap((page) => page.runs || []) ||
                [];
            return runs.some(
                (run) =>
                    run.status === "pending" || run.status === "in_progress",
            )
                ? 5000
                : false;
        },
        refetchIntervalInBackground: true,
    });
}

export function useCreateAutomation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const { data } = await axios.post("/api/automations", payload);
            return data;
        },
        onSuccess: (automation) => {
            queryClient.setQueryData(
                ["automations", automation._id],
                automation,
            );
            queryClient.invalidateQueries({
                queryKey: ["automations"],
                exact: true,
            });
        },
    });
}

export function useUpdateAutomation(id) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const { data } = await axios.put(
                `/api/automations/${encodeURIComponent(id)}`,
                payload,
            );
            return data;
        },
        onSuccess: (automation) => {
            queryClient.setQueryData(["automations", id], (current) => ({
                ...current,
                ...automation,
                content: automation.content ?? current?.content,
                files: automation.files ?? current?.files,
            }));
            queryClient.setQueryData(["automations"], (current) =>
                Array.isArray(current)
                    ? current.map((item) =>
                          item._id === automation._id
                              ? { ...item, ...automation }
                              : item,
                      )
                    : current,
            );
            queryClient.invalidateQueries({
                queryKey: ["automations"],
                exact: true,
            });
            queryClient.invalidateQueries({
                queryKey: ["automations", "pinned"],
                exact: true,
            });
            queryClient.invalidateQueries({
                queryKey: ["currentUserDigest"],
            });
        },
    });
}

export function useDeleteAutomation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const { data } = await axios.delete(
                `/api/automations/${encodeURIComponent(id)}`,
            );
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["automations"] });
            queryClient.invalidateQueries({
                queryKey: ["automations", "pinned"],
            });
            queryClient.invalidateQueries({
                queryKey: ["currentUserDigest"],
            });
        },
    });
}

export function useRunAutomation(id) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await axios.post(
                `/api/automations/${encodeURIComponent(id)}/run`,
                {},
            );
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            queryClient.invalidateQueries({
                queryKey: ["automations", id, "runs"],
            });
            queryClient.invalidateQueries({
                queryKey: ["automations", "pinned"],
            });
            queryClient.invalidateQueries({
                queryKey: ["currentUserDigest"],
            });
        },
    });
}

export function useUploadAutomationFile(id) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (file) => {
            const formData = new FormData();
            formData.append("file", file);
            const { data } = await axios.post(
                `/api/automations/${encodeURIComponent(id)}/files`,
                formData,
            );
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["automations", id] });
        },
    });
}

export function useSuggestAutomation() {
    return useMutation({
        mutationFn: async (prompt) => {
            const { data } = await axios.post("/api/automations/suggest", {
                prompt,
            });
            return data?.suggestion || null;
        },
    });
}

export function useDeleteAutomationFile(id) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (filename) => {
            const { data } = await axios.delete(
                `/api/automations/${encodeURIComponent(id)}/files?filename=${encodeURIComponent(filename)}`,
            );
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["automations", id] });
        },
    });
}
