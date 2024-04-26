import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApolloClient } from "@apollo/client";
import { QUERIES } from "../../src/graphql";
import axios from "axios";

export function useUpdateAiMemory(
    userId,
    contextId,
    aiMemory,
    aiMemorySelfModify,
) {
    const queryClient = useQueryClient();
    const apolloClient = useApolloClient();

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
            await queryClient.cancelQueries(["user", userId]);
            const previousUser = await queryClient.getQueryData([
                "user",
                userId,
            ]);

            queryClient.setQueryData(["user", userId], (old) => {
                return {
                    ...old,
                    contextId,
                    aiMemory,
                    aiMemorySelfModify,
                };
            });

            // update the Cortex copy
            const variables = {
                contextId: contextId,
                aiMemory: aiMemory,
            };

            apolloClient
                .query({
                    query: QUERIES.RAG_SAVE_MEMORY,
                    variables,
                })
                .then((result) => {
                    //console.log("Saved memory to Cortex", result);
                })
                .catch((error) => {
                    console.error("Failed to save memory to Cortex", error);
                });

            return { previousUser };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(["user", userId]);
        },
    });

    return mutation;
}
