import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function useCurrentUserDigest() {
    const query = useQuery({
        queryKey: ["currentUserDigest"],
        queryFn: async ({ queryKey }) => {
            const { data } = await axios.get(`/api/users/me/digest`);
            return data;
        },
        staleTime: Infinity,
        refetchInterval: (query) => {
            const data = query?.state?.data;

            const isAnyBlockPending = data?.blocks?.some(
                (block) =>
                    block.state?.status === "pending" ||
                    block.state?.status === "in_progress",
            );

            return isAnyBlockPending ? 5000 : false;
        },
    });

    return query;
}

export function useUpdateCurrentUserDigest() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ ...data }) => {
            // insert mutation code
            const response = await axios.patch(`/api/users/me/digest`, data);
            return response.data;
        },
        onMutate: async ({ ...data }) => {
            queryClient.setQueryData(["currentUserDigest"], (oldData) => {
                for (const block of data.blocks) {
                    const existingBlock = oldData.blocks.find(
                        (b) => b._id?.toString() === block._id?.toString(),
                    );

                    if (existingBlock) {
                        if (existingBlock.prompt !== block.prompt) {
                            block.content = null;
                            block.updatedAt = null;
                        }
                    }
                }

                return {
                    ...oldData,
                    ...data,
                };
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["currentUserDigest"] });
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
    });

    return mutation;
}
