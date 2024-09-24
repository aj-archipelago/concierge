import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function usePathway(id) {
    const query = useQuery({
        queryKey: ["pathway", id],
        queryFn: async ({ queryKey }) => {
            const { data } = await axios.get(`/api/pathways/${id}`);
            return data;
        },
        staleTime: Infinity,
    });

    return query;
}

export function useUpdatePathway() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id, data }) => {
            await axios.put(`/api/pathways/${id}`, data);
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ["pathway", id] });
            const previousPathways = queryClient.getQueryData([
                "pathway",
                id,
            ]);
            queryClient.setQueryData(["pathway", id], (old) => {
                return { ...old, ...data };
            });
            return { previousPathways };
        },
        onSettled: (data, error, variables, context) => {
            queryClient.invalidateQueries({
                queryKey: ["pathway", variables.id],
            });
            queryClient.invalidateQueries({ queryKey: ["pathways"] });
        },
    });

    return mutation;
}

export function usePathways() {
    const query = useQuery({
        queryKey: ["pathways"],
        queryFn: async () => {
            const { data } = await axios.get(`/api/pathways`);
            return data;
        },
    });

    return query;
}

export function useDeletePathway() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id }) => {
            await axios.delete(`/api/pathways/${id}`);
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: ["pathways"] });
            const previousPathways = queryClient.getQueryData(["pathways"]);
            queryClient.setQueryData(["pathways"], (old) => {
                return old?.filter((pathway) => pathway._id !== id);
            });
            return { previousPathways };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["pathways"] });
        },
    });

    return mutation;
}

export function useCreatePathway() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (attrs) => {
            const { data } = await axios.post(`/api/pathways`, attrs);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["pathways"] });
        },
    });

    return mutation;
}

