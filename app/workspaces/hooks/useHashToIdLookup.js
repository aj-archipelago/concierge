import { useMemo } from "react";
import { useWorkspaceFiles } from "../../queries/workspaces";

/**
 * Hook to build lookup maps from workspace files for matching file identifiers to MongoDB _id.
 * Returns a Map keyed by hash -> _id and blobPath -> _id.
 *
 * @param {string} workspaceId - The workspace ID
 * @returns {Map<string, string>} - Map of (hash|blobPath) -> _id
 */
export function useHashToIdLookup(workspaceId) {
    const { data: workspaceFilesData } = useWorkspaceFiles(workspaceId);

    return useMemo(() => {
        const map = new Map();
        const files = workspaceFilesData?.files || [];
        files.forEach((f) => {
            if (f._id) {
                if (f.blobPath) map.set(f.blobPath, f._id);
                if (f.hash) map.set(f.hash, f._id);
            }
        });
        return map;
    }, [workspaceFilesData]);
}
