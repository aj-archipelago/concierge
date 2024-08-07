import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

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
                (block) => block.state?.status === "pending",
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
        },
    });

    return mutation;
}

export function useRegenerateDigestBlock() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ blockId }) => {
            // insert mutation code
            const response = await axios.post(
                `/api/users/me/digest/blocks/${blockId}/regenerate`,
            );
            return response.data;
        },
        onMutate: async ({ blockId }) => {
            queryClient.setQueryData(["currentUserDigest"], (oldData) => {
                const block = oldData.blocks.find(
                    (b) => b._id?.toString() === blockId?.toString(),
                );

                if (block) {
                    block.state.status = "pending";
                }

                return {
                    ...oldData,
                };
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["currentUserDigest"] });
        },
    });

    return mutation;
}
