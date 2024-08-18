import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function useUpdateAiMemory(
    userId,
    contextId,
    aiMemory,
    aiMemorySelfModify,
) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({
            userId,
            contextId,
            aiMemory,
            aiMemorySelfModify,
        }) => {
            // persist it to user options in the database
            const response = await axios.post(`/api/options`, {
                userId,
                contextId,
                aiMemory,
                aiMemorySelfModify,
            });
            return response.data;
        },
        onMutate: async ({
            userId,
            contextId,
            aiMemory,
            aiMemorySelfModify,
        }) => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });
            const previousUser = await queryClient.getQueryData([
                "currentUser",
            ]);

            queryClient.setQueryData(["currentUser"], (old) => {
                return {
                    ...old,
                    contextId,
                    aiMemory,
                    aiMemorySelfModify,
                };
            });

            return { previousUser };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        },
    });

    return mutation;
}
