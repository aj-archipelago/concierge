import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function useUpdateAiOptions() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({
            userId,
            contextId,
            aiMemorySelfModify,
            aiName,
            agentModel,
            useCustomEntities,
            reasoningEffort,
        }) => {
            // persist it to user options in the database
            const response = await axios.post(`/api/options`, {
                userId,
                contextId,
                aiMemorySelfModify,
                aiName,
                agentModel,
                useCustomEntities,
                reasoningEffort,
            });
            return response.data;
        },
        onMutate: async ({
            userId,
            contextId,
            aiMemorySelfModify,
            aiName,
            agentModel,
            useCustomEntities,
            reasoningEffort,
        }) => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });
            const previousUser = await queryClient.getQueryData([
                "currentUser",
            ]);

            queryClient.setQueryData(["currentUser"], (old) => {
                if (!old) return old;
                return {
                    ...old,
                    contextId,
                    aiMemorySelfModify,
                    aiName,
                    agentModel,
                    useCustomEntities,
                    reasoningEffort,
                };
            });

            return { previousUser };
        },
        onError: (error, variables, context) => {
            // Rollback optimistic update on error
            if (context?.previousUser) {
                queryClient.setQueryData(["currentUser"], context.previousUser);
            }
        },
        onSettled: () => {
            // Always refetch to ensure we have the latest data from server
            queryClient.refetchQueries({ queryKey: ["currentUser"] });
        },
    });

    return mutation;
}
