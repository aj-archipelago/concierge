import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export function useDeleteRun() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id }) => {
            await axios.delete(`/api/runs/${id}`);
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: ["runs"] });
            const previousRuns = queryClient.getQueryData(["runs"]);
            queryClient.setQueryData(["runs"], (old) =>
                old?.filter((run) => run.id !== id),
            );
            return { previousRuns };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["runs"] });
        },
    });

    return mutation;
}

export function useCreateRun() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ text, promptId, systemPrompt, workspaceId }) => {
            const { data } = await axios.post(`/api/runs`, {
                text,
                promptId,
                systemPrompt,
                workspaceId,
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["runs"] });
        },
    });

    return mutation;
}
