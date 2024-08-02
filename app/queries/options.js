import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export function useUpdateAIOptions(
    userId,
    contextId,
    aiMemorySelfModify,
    aiName,
    aiStyle,
) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({
            userId,
            contextId,
            aiMemorySelfModify,
            aiName,
            aiStyle,
        }) => {
            // persist it to user options in the database
            const response = await axios.post(`/api/options`, {
                userId,
                contextId,
                aiMemorySelfModify,
                aiName,
                aiStyle,
            });
            return response.data;
        },
        onMutate: async ({
            userId,
            contextId,
            aiMemorySelfModify,
            aiName,
            aiStyle,
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
