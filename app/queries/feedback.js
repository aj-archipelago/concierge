import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function usePostFeedback() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({
            message,
            screenshot,
            category,
            pageUrl,
            userAgent,
        }) => {
            const response = await axios.post(`/api/feedback`, {
                message,
                screenshot,
                category,
                pageUrl,
                userAgent,
            });
            return response.data;
        },
        onMutate: async ({ message, screenshot, category }) => {
            await queryClient.cancelQueries({ queryKey: ["feedback"] });
            const previousFeedback = await queryClient.getQueryData([
                "feedback",
            ]);

            queryClient.setQueryData(["feedback"], (old) => {
                return {
                    ...old,
                    message,
                    screenshot,
                    category,
                };
            });

            return { previousFeedback };
        },
    });

    return mutation;
}
