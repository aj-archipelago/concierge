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
            aiStyle,
            streamingEnabled,
        }) => {
            // persist it to user options in the database
            const response = await axios.post(`/api/options`, {
                userId,
                contextId,
                aiMemorySelfModify,
                aiName,
                aiStyle,
                streamingEnabled,
            });
            return response.data;
        },
        onMutate: async ({
            userId,
            contextId,
            aiMemorySelfModify,
            aiName,
            aiStyle,
            streamingEnabled,
        }) => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });
            const previousUser = await queryClient.getQueryData([
                "currentUser",
            ]);

            queryClient.setQueryData(["currentUser"], (old) => {
                return {
                    ...old,
                    contextId,
                    aiMemorySelfModify,
                    aiName,
                    aiStyle,
                    streamingEnabled,
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
