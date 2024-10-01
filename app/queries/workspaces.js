import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function useWorkspace(id) {
    const query = useQuery({
        queryKey: ["workspace", id],
        queryFn: async ({ queryKey }) => {
            const { data } = await axios.get(`/api/workspaces/${id}`);
            return data;
        },
        staleTime: Infinity,
    });

    return query;
}

export function useUpdateWorkspace() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id, data }) => {
            await axios.put(`/api/workspaces/${id}`, data);
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ["workspace", id] });
            const previousWorkspaces = queryClient.getQueryData([
                "workspace",
                id,
            ]);
            queryClient.setQueryData(["workspace", id], (old) => {
                return { ...old, ...data };
            });
            return { previousWorkspaces };
        },
        onSettled: (data, error, variables, context) => {
            queryClient.invalidateQueries({
                queryKey: ["workspace", variables.id],
            });
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
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

export function usePublishWorkspace() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id, ...rest }) => {
            const response = await axios.post(
                `/api/workspaces/${id}/publish`,
                rest,
            );
            return response.data;
        },
        onSuccess: (data) => {
            console.log("data", data);
            queryClient.setQueryData(["workspaces"], (old) => {
                return old?.map((workspace) => {
                    if (workspace._id === data._id) {
                        return data;
                    }
                    return workspace;
                });
            });

            queryClient.setQueryData(["workspace", data._id], (old) => {
                return data;
            });
        },
    });

    return mutation;
}

export function useDeleteWorkspace() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id }) => {
            await axios.delete(`/api/workspaces/${id}`);
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: ["workspaces"] });
            const previousWorkspaces = queryClient.getQueryData(["workspaces"]);
            queryClient.setQueryData(["workspaces"], (old) => {
                return old?.filter((workspace) => workspace._id !== id);
            });
            return { previousWorkspaces };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
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
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
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
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
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
        enabled: !!id,
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
            await queryClient.cancelQueries({ queryKey: ["runs"] });
            const previousRuns = queryClient.getQueryData(["runs"]);
            queryClient.setQueryData(["runs"], (old) => {
                return old?.filter((run) => run.workspace !== id);
            });
            return { previousRuns };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["runs"] });
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
            queryClient.invalidateQueries({ queryKey: ["workspaceState", id] });
        },
    });

    return mutation;
}
