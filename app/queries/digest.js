import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

const DIGEST_ACTIVE_AUTOMATION_POLL_MS = 5_000;

export function digestHasActiveAutomationRun(digest) {
    return (digest?.blocks || []).some((block) => {
        const status = block?.automationRun?.status;
        return status === "pending" || status === "in_progress";
    });
}

export function getDigestRefetchInterval(query) {
    return digestHasActiveAutomationRun(query?.state?.data)
        ? DIGEST_ACTIVE_AUTOMATION_POLL_MS
        : false;
}

export function useCurrentUserDigest() {
    const query = useQuery({
        queryKey: ["currentUserDigest"],
        queryFn: async ({ queryKey }) => {
            const { data } = await axios.get(`/api/users/me/digest`);
            return data;
        },
        staleTime: Infinity,
        // Home automation widgets read run status from the digest payload.
        // Poll only while a linked run is active — never as a tight loop.
        refetchInterval: getDigestRefetchInterval,
        refetchIntervalInBackground: true,
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
            // Prefer inbox over the broad ["tasks"] prefix — the latter also
            // matches ["tasks","live",...] and can amplify live/inbox refetch loops.
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
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
        onMutate: async ({ blockId }) => {},
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["currentUserDigest"] });
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
        },
    });

    return mutation;
}
