import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export function usePostFeedback() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ message, screenshot }) => {
            const response = await axios.post(`/api/feedback`, {
                message,
                screenshot,
            });
            return response.data;
        },
        onMutate: async ({ message, screenshot }) => {
            await queryClient.cancelQueries({ queryKey: ["feedback"] });
            const previousFeedback = await queryClient.getQueryData([
                "feedback",
            ]);

            queryClient.setQueryData(["feedback"], (old) => {
                return {
                    ...old,
                    message,
                    screenshot,
                };
            });

            return { previousFeedback };
        },
    });

    return mutation;
}
