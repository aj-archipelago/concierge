import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export function useWorkspace(id) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["workspaces", id],
        queryFn: async ({ queryKey }) => {
            const { data } = await axios.get(`/api/workspaces/${id}`);

            for (const workspace of data) {
                queryClient.setQueryData(
                    ["workspaces", workspace._id],
                    workspace,
                );
            }

            return data;
        },
        staleTime: 1000 * 60 * 5,
    });

    return query;
}

export function useUpdateWorkspace() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id, data }) => {
            const { data: updatedWorkspace } = await axios.put(
                `/api/workspaces/${id}`,
                data,
            );
            queryClient.invalidateQueries(["workspaces", id]);
            return updatedWorkspace;
        },
    });

    return mutation;
}

export function useWorkspaces() {
    const query = useQuery({
        queryKey: ["workspaces"],
        queryFn: async () => {
            const { data } = await axios.get(`/api/workspaces`);
            return data;
        },
    });

    return query;
}

export function useDeleteWorkspace() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id }) => {
            await axios.delete(`/api/workspaces/${id}`);
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries(["workspaces"]);
            const previousWorkspaces = queryClient.getQueryData(["workspaces"]);
            queryClient.setQueryData(["workspaces"], (old) => {
                return old?.filter((workspace) => workspace._id !== id);
            });
            return { previousWorkspaces };
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["workspaces"]);
        },
    });

    return mutation;
}

export function useCreateWorkspace() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (attrs) => {
            const { data } = await axios.post(`/api/workspaces`, attrs);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["workspaces"]);
        },
    });

    return mutation;
}

export function useCopyWorkspace() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id }) => {
            const { data } = await axios.post(`/api/workspaces/${id}/copy`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["workspaces"]);
        },
    });

    return mutation;
}

export function useWorkspaceRuns(id) {
    const query = useQuery({
        queryKey: ["runs", { workspaceId: id }],
        queryFn: async () => {
            const { data } = await axios.get(`/api/workspaces/${id}/runs`);
            return data;
        },
        staleTime: Infinity,
    });

    return query;
}

export function useDeleteWorkspaceRuns() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id }) => {
            await axios.delete(`/api/workspaces/${id}/runs`);
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries(["runs"]);
            const previousRuns = queryClient.getQueryData(["runs"]);
            queryClient.setQueryData(["runs"], (old) => {
                return old?.filter((run) => run.workspace !== id);
            });
            return { previousRuns };
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["runs"]);
        },
    });

    return mutation;
}

export function useWorkspaceState(id) {
    const query = useQuery({
        queryKey: ["workspaceState", id],
        queryFn: async ({ queryKey }) => {
            const { data } = await axios.get(`/api/workspaces/${id}/state`);
            return data;
        },
        staleTime: Infinity,
        enabled: !!id,
    });

    return query;
}

export function useUpdateWorkspaceState() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id, attrs }) => {
            if (!id || !attrs) return;
            const { data } = await axios.put(
                `/api/workspaces/${id}/state`,
                attrs,
            );
            return data;
        },
        onSuccess: (data, { id }) => {
            queryClient.invalidateQueries(["workspaceState", id]);
        },
    });

    return mutation;
}
