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
