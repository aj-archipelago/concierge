import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import { isShareActive, shareQueryKey } from "./shareUtils";

export function useShareSettings(
    entityType,
    entityId,
    { enabled = true, legacyShared = false, retry = false } = {},
) {
    const query = useQuery({
        queryKey: shareQueryKey(entityType, entityId),
        queryFn: async () => {
            const { data } = await axios.get(
                `/api/shares/${entityType}/${entityId}`,
            );
            return data;
        },
        enabled: enabled && Boolean(entityType && entityId),
        staleTime: 30_000,
        retry,
    });

    return {
        ...query,
        isShared: isShareActive(query.data, { legacyShared }),
    };
}
