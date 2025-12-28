import { useMemo } from "react";
import { useWorkspaceFiles } from "../../queries/workspaces";

/**
 * Hook to build a hash -> MongoDB _id lookup map from workspace files
 * Used for matching Cortex files (which have hash) to MongoDB files (which have _id)
 *
 * @param {string} workspaceId - The workspace ID
 * @returns {Map<string, string>} - Map of hash -> _id
 */
export function useHashToIdLookup(workspaceId) {
    const { data: workspaceFilesData } = useWorkspaceFiles(workspaceId);

    return useMemo(() => {
        const map = new Map();
        const files = workspaceFilesData?.files || [];
        files.forEach((f) => {
            if (f.hash && f._id) {
                map.set(f.hash, f._id);
            }
        });
        return map;
    }, [workspaceFilesData]);
}
